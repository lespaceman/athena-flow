import {useEffect, useRef, useCallback, useState} from 'react';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
	PROTOCOL_VERSION,
	type HookResultEnvelope,
	type HookResultPayload,
	type HookEventDisplay,
	type HookEventEnvelope,
	createPassthroughResult,
	createPreToolUseAllowResult,
	createPreToolUseDenyResult,
	createAskUserQuestionResult,
	createPermissionRequestAllowResult,
	createBlockResult,
	isValidHookEventEnvelope,
	generateId,
	isToolEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
} from '../types/hooks/index.js';
import {
	type PendingRequest,
	type UseHookServerResult,
	type PermissionDecision,
} from '../types/server.js';
import {type HookRule, matchRule} from '../types/rules.js';
import {isPermissionRequired} from '../services/permissionPolicy.js';
import {parseTranscriptFile} from '../utils/transcriptParser.js';
import {
	initHookLogger,
	logHookReceived,
	logHookResponded,
	closeHookLogger,
} from '../utils/hookLogger.js';

// Re-export for backwards compatibility
export type {UseHookServerResult};
export {matchRule};

const AUTO_PASSTHROUGH_MS = 4000; // Auto-passthrough before forwarder timeout (5000ms)
const MAX_EVENTS = 100; // Maximum events to keep in memory

export function useHookServer(
	projectDir: string,
	instanceId: number,
): UseHookServerResult {
	const serverRef = useRef<net.Server | null>(null);
	const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
	const activeSubagentStackRef = useRef<string[]>([]);
	const isMountedRef = useRef(true); // Track if component is mounted
	const [events, setEvents] = useState<HookEventDisplay[]>([]);
	const [isServerRunning, setIsServerRunning] = useState(false);
	const [socketPath, setSocketPath] = useState<string | null>(null);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [rules, setRules] = useState<HookRule[]>([]);
	const rulesRef = useRef<HookRule[]>([]);

	// Keep ref in sync so the socket handler sees current rules
	rulesRef.current = rules;

	// Permission queue -- requestIds waiting for user decision
	const [permissionQueue, setPermissionQueue] = useState<string[]>([]);

	// Question queue -- requestIds for AskUserQuestion events waiting for answers
	const [questionQueue, setQuestionQueue] = useState<string[]>([]);

	// Reset session to start fresh conversation
	const resetSession = useCallback(() => {
		setCurrentSessionId(null);
	}, []);

	// Rule management callbacks
	const addRule = useCallback((rule: Omit<HookRule, 'id'>) => {
		const newRule: HookRule = {...rule, id: generateId()};
		setRules(prev => [...prev, newRule]);
	}, []);

	const removeRule = useCallback((id: string) => {
		setRules(prev => prev.filter(r => r.id !== id));
	}, []);

	const clearRules = useCallback(() => {
		setRules([]);
	}, []);

	const clearEvents = useCallback(() => {
		setEvents([]);
	}, []);

	// Respond to a hook event
	const respond = useCallback(
		(requestId: string, result: HookResultPayload) => {
			const pending = pendingRequestsRef.current.get(requestId);
			if (!pending) return;

			// Log the response with response time
			const responseTimeMs = Date.now() - pending.receiveTimestamp;
			logHookResponded(requestId, result.action, responseTimeMs);

			// Clear timeout
			clearTimeout(pending.timeoutId);

			// Send response
			const envelope: HookResultEnvelope = {
				v: PROTOCOL_VERSION,
				kind: 'hook_result',
				request_id: requestId,
				ts: Date.now(),
				payload: result,
			};

			try {
				pending.socket.write(JSON.stringify(envelope) + '\n');
				pending.socket.end();
			} catch {
				// Socket error, ignore
			}

			// Remove from pending first (always safe)
			pendingRequestsRef.current.delete(requestId);

			// Only update React state if component is still mounted
			if (!isMountedRef.current) return;

			// Update event status
			const status: HookEventDisplay['status'] =
				result.action === 'block_with_stderr' ? 'blocked' : result.action;

			setEvents(prev =>
				prev.map(e => (e.requestId === requestId ? {...e, status, result} : e)),
			);
		},
		[],
	);

	// Resolve a permission request with the user's decision
	const resolvePermission = useCallback(
		(requestId: string, decision: PermissionDecision) => {
			const toolName =
				pendingRequestsRef.current.get(requestId)?.event.toolName;
			const isAllow = decision === 'allow' || decision === 'always-allow';

			// Persist "always" decisions as rules for future requests
			if (
				toolName &&
				(decision === 'always-allow' || decision === 'always-deny')
			) {
				addRule({
					toolName,
					action: isAllow ? 'approve' : 'deny',
					addedBy: 'permission-dialog',
				});
			}

			// Send explicit allow/deny so Claude Code skips its own permission prompt
			const result = isAllow
				? createPreToolUseAllowResult()
				: createPreToolUseDenyResult('Denied by user via permission dialog');

			respond(requestId, result);
			setPermissionQueue(prev => prev.filter(id => id !== requestId));
		},
		[respond, addRule],
	);

	// Resolve an AskUserQuestion request with the user's answers
	const resolveQuestion = useCallback(
		(requestId: string, answers: Record<string, string>) => {
			const result = createAskUserQuestionResult(answers);
			respond(requestId, result);
			setQuestionQueue(prev => prev.filter(id => id !== requestId));
		},
		[respond],
	);

	// Get pending events
	const pendingEvents = events.filter(e => e.status === 'pending');

	useEffect(() => {
		// Mark as mounted
		isMountedRef.current = true;

		// Create socket directory with instance-specific socket name
		const socketDir = path.join(projectDir, '.claude', 'run');
		const sockPath = path.join(socketDir, `ink-${instanceId}.sock`);

		try {
			fs.mkdirSync(socketDir, {recursive: true});
		} catch {
			// Directory might exist
		}

		// Remove existing socket file
		try {
			fs.unlinkSync(sockPath);
		} catch {
			// File might not exist
		}

		// Initialize hook logger
		initHookLogger(projectDir);

		/** Shared context passed to each handler in the dispatch chain. */
		type HandlerContext = {
			envelope: HookEventEnvelope;
			displayEvent: HookEventDisplay;
			socket: net.Socket;
			receiveTimestamp: number;
		};

		// Append a display event and prune to MAX_EVENTS
		function addEvent(event: HookEventDisplay): void {
			setEvents(prev => {
				const updated = [...prev, event];
				return updated.length > MAX_EVENTS
					? updated.slice(-MAX_EVENTS)
					: updated;
			});
		}

		// Register a pending request for the given envelope/socket
		function storePending(
			requestId: string,
			socket: net.Socket,
			displayEvent: HookEventDisplay,
			receiveTimestamp: number,
			timeoutId: ReturnType<typeof setTimeout>,
		): void {
			pendingRequestsRef.current.set(requestId, {
				requestId,
				socket,
				timeoutId,
				event: displayEvent,
				receiveTimestamp,
			});
		}

		/** Store pending with auto-passthrough timeout. */
		function storeWithAutoPassthrough(ctx: HandlerContext): void {
			const timeoutId = setTimeout(() => {
				respond(ctx.envelope.request_id, createPassthroughResult());
			}, AUTO_PASSTHROUGH_MS);
			storePending(
				ctx.envelope.request_id,
				ctx.socket,
				ctx.displayEvent,
				ctx.receiveTimestamp,
				timeoutId,
			);
		}

		/** Store pending without auto-passthrough (requires user input). */
		function storeWithoutPassthrough(ctx: HandlerContext): void {
			storePending(
				ctx.envelope.request_id,
				ctx.socket,
				ctx.displayEvent,
				ctx.receiveTimestamp,
				undefined as unknown as ReturnType<typeof setTimeout>,
			);
		}

		// ── Event handler functions ─────────────────────────────────────
		// Each returns true if it handled the event (caller should return).

		/** Handle SubagentStop: add as first-class event and parse transcript. */
		function handleSubagentStop(ctx: HandlerContext): boolean {
			const {envelope, displayEvent} = ctx;
			if (!isSubagentStopEvent(envelope.payload)) return false;

			storeWithAutoPassthrough(ctx);
			addEvent(displayEvent);

			// Parse subagent transcript to extract response text
			const stopPayload = envelope.payload;
			const transcriptPath = stopPayload.agent_transcript_path;
			if (transcriptPath) {
				parseTranscriptFile(transcriptPath)
					.then(summary => {
						if (isMountedRef.current) {
							setEvents(prev =>
								prev.map(e =>
									e.id === displayEvent.id
										? {...e, transcriptSummary: summary}
										: e,
								),
							);
						}
					})
					.catch(err => {
						console.error('[SubagentStop] Failed to parse transcript:', err);
					});
			}

			return true;
		}

		/** Auto-allow PermissionRequest events (deny rules still apply). */
		function handlePermissionRequest(ctx: HandlerContext): boolean {
			const {envelope} = ctx;
			if (envelope.hook_event_name !== 'PermissionRequest') return false;
			if (!isToolEvent(envelope.payload)) return false;

			// Deny rules still take effect at the PermissionRequest stage
			const matchedRule = matchRule(
				rulesRef.current,
				envelope.payload.tool_name,
			);
			if (matchedRule?.action === 'deny') {
				storeWithoutPassthrough(ctx);
				addEvent(ctx.displayEvent);
				respond(
					envelope.request_id,
					createBlockResult(`Blocked by rule: ${matchedRule.addedBy}`),
				);
				return true;
			}

			// Auto-allow everything else — don't addEvent() since PermissionRequest
			// duplicates the PreToolUse event that follows and would create UI noise.
			storeWithoutPassthrough(ctx);
			respond(envelope.request_id, createPermissionRequestAllowResult());
			return true;
		}

		/** Route AskUserQuestion events to the question queue. */
		function handleAskUserQuestion(ctx: HandlerContext): boolean {
			const {envelope} = ctx;
			if (
				envelope.hook_event_name !== 'PreToolUse' ||
				!isToolEvent(envelope.payload) ||
				envelope.payload.tool_name !== 'AskUserQuestion'
			) {
				return false;
			}

			storeWithoutPassthrough(ctx);
			addEvent(ctx.displayEvent);
			setQuestionQueue(prev => [...prev, envelope.request_id]);
			return true;
		}

		/** Apply matching rules to PreToolUse events. */
		function handlePreToolUseRules(ctx: HandlerContext): boolean {
			const {envelope} = ctx;
			if (
				envelope.hook_event_name !== 'PreToolUse' ||
				!isToolEvent(envelope.payload)
			) {
				return false;
			}

			const matchedRule = matchRule(
				rulesRef.current,
				envelope.payload.tool_name,
			);
			if (!matchedRule) return false;

			const result =
				matchedRule.action === 'deny'
					? createPreToolUseDenyResult(
							`Blocked by rule: ${matchedRule.addedBy}`,
						)
					: createPreToolUseAllowResult();

			// Store briefly so respond() can find it, then respond immediately
			storeWithoutPassthrough(ctx);
			addEvent(ctx.displayEvent);
			respond(envelope.request_id, result);
			return true;
		}

		/** Route permission-required PreToolUse events to the permission queue. */
		function handlePermissionCheck(ctx: HandlerContext): boolean {
			const {envelope} = ctx;
			if (
				envelope.hook_event_name !== 'PreToolUse' ||
				!isToolEvent(envelope.payload) ||
				!isPermissionRequired(
					envelope.payload.tool_name,
					rulesRef.current,
					envelope.payload.tool_input,
				)
			) {
				return false;
			}

			storeWithoutPassthrough(ctx);
			addEvent(ctx.displayEvent);
			setPermissionQueue(prev => [...prev, envelope.request_id]);
			return true;
		}

		/** Capture session ID and enrich SessionEnd with transcript data. */
		function handleSessionTracking(ctx: HandlerContext): void {
			const {envelope, displayEvent} = ctx;

			if (envelope.hook_event_name === 'SessionStart') {
				setCurrentSessionId(envelope.session_id);
			}

			if (envelope.hook_event_name !== 'SessionEnd') return;

			const updateTranscript = (
				summary: HookEventDisplay['transcriptSummary'],
			) =>
				setEvents(prev =>
					prev.map(e =>
						e.id === displayEvent.id ? {...e, transcriptSummary: summary} : e,
					),
				);

			const transcriptPath = envelope.payload.transcript_path;
			if (transcriptPath) {
				parseTranscriptFile(transcriptPath)
					.then(summary => {
						if (isMountedRef.current) updateTranscript(summary);
					})
					.catch(err => {
						console.error('[SessionEnd] Failed to parse transcript:', err);
					});
			} else {
				updateTranscript({
					lastAssistantText: null,
					lastAssistantTimestamp: null,
					messageCount: 0,
					toolCallCount: 0,
					error: 'No transcript path provided',
				});
			}
		}

		// ── Server creation ─────────────────────────────────────────────

		const server = net.createServer((socket: net.Socket) => {
			let data = '';

			socket.on('data', (chunk: Buffer) => {
				data += chunk.toString();

				// Check for complete NDJSON line
				const lines = data.split('\n');
				if (lines.length <= 1 || !lines[0]) return;

				// Reset buffer for next message before processing
				const line = lines[0];
				data = lines.slice(1).join('\n');

				try {
					const parsed: unknown = JSON.parse(line);

					if (!isValidHookEventEnvelope(parsed)) {
						socket.end();
						return;
					}

					const envelope = parsed as HookEventEnvelope;
					const payload = envelope.payload;

					logHookReceived(envelope);

					// Build shared context for the handler chain
					const ctx: HandlerContext = {
						envelope,
						displayEvent: {
							id: generateId(),
							requestId: envelope.request_id,
							timestamp: new Date(envelope.ts),
							hookName: envelope.hook_event_name,
							toolName: isToolEvent(payload) ? payload.tool_name : undefined,
							toolUseId: isToolEvent(payload) ? payload.tool_use_id : undefined,
							payload,
							status: 'pending',
						},
						socket,
						receiveTimestamp: Date.now(),
					};

					// Track active subagents and tag child events
					if (isSubagentStartEvent(envelope.payload)) {
						activeSubagentStackRef.current.push(envelope.payload.agent_id);
					} else if (isSubagentStopEvent(envelope.payload)) {
						const agentId = envelope.payload.agent_id;
						activeSubagentStackRef.current =
							activeSubagentStackRef.current.filter(id => id !== agentId);
					} else if (activeSubagentStackRef.current.length > 0) {
						// Tag non-subagent events with the innermost active subagent
						ctx.displayEvent.parentSubagentId =
							activeSubagentStackRef.current[
								activeSubagentStackRef.current.length - 1
							];
					}

					// Dispatch to handlers (first match wins)
					const handled =
						handleSubagentStop(ctx) ||
						handlePermissionRequest(ctx) ||
						handleAskUserQuestion(ctx) ||
						handlePreToolUseRules(ctx) ||
						handlePermissionCheck(ctx);

					if (!handled) {
						// Default: auto-passthrough after timeout
						storeWithAutoPassthrough(ctx);
						addEvent(ctx.displayEvent);
					}

					// Session-specific tracking (runs regardless of handler)
					handleSessionTracking(ctx);
				} catch (err) {
					console.error('[hook-server] Error processing event:', err);
					socket.end();
				}
			});

			socket.on('error', () => {
				// Socket error, cleanup handled by close
			});

			socket.on('close', () => {
				// Clean up any pending requests for this socket
				const closedRequestIds: string[] = [];
				for (const [reqId, pending] of pendingRequestsRef.current) {
					if (pending.socket === socket) {
						clearTimeout(pending.timeoutId);
						pendingRequestsRef.current.delete(reqId);
						closedRequestIds.push(reqId);
					}
				}

				// Remove closed requests from the permission/question queues so the
				// dialogs do not get stuck showing a dead request.
				if (closedRequestIds.length > 0 && isMountedRef.current) {
					setPermissionQueue(prev =>
						prev.filter(id => !closedRequestIds.includes(id)),
					);
					setQuestionQueue(prev =>
						prev.filter(id => !closedRequestIds.includes(id)),
					);
				}
			});
		});

		server.on('listening', () => {
			setIsServerRunning(true);
			setSocketPath(sockPath);
		});

		server.on('error', (err: Error) => {
			console.error('Hook server error:', err);
			setIsServerRunning(false);
		});

		server.listen(sockPath, () => {
			// Set socket file permissions to owner-only (0o600)
			try {
				fs.chmodSync(sockPath, 0o600);
			} catch {
				// Chmod might fail on some systems, continue anyway
			}
		});
		serverRef.current = server;

		// Capture ref for cleanup (avoids stale ref warning)
		const pendingRequests = pendingRequestsRef.current;

		// Cleanup
		return () => {
			// Mark as unmounted to prevent state updates
			isMountedRef.current = false;

			// Clear active subagent tracking
			activeSubagentStackRef.current = [];

			// Clear all pending timeouts
			for (const pending of pendingRequests.values()) {
				clearTimeout(pending.timeoutId);
			}
			pendingRequests.clear();

			// Close server
			server.close();
			serverRef.current = null;
			setIsServerRunning(false);

			// Remove socket file
			try {
				fs.unlinkSync(sockPath);
			} catch {
				// File might not exist
			}

			// Close hook logger
			closeHookLogger();
		};
	}, [projectDir, instanceId, respond]);

	const currentPermissionRequest =
		permissionQueue.length > 0
			? (events.find(e => e.requestId === permissionQueue[0]) ?? null)
			: null;

	const currentQuestionRequest =
		questionQueue.length > 0
			? (events.find(e => e.requestId === questionQueue[0]) ?? null)
			: null;

	return {
		events,
		isServerRunning,
		respond,
		pendingEvents,
		socketPath,
		currentSessionId,
		resetSession,
		rules,
		addRule,
		removeRule,
		clearRules,
		clearEvents,
		currentPermissionRequest,
		permissionQueueCount: permissionQueue.length,
		resolvePermission,
		currentQuestionRequest,
		questionQueueCount: questionQueue.length,
		resolveQuestion,
	};
}
