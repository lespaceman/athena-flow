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
import {
	initHookLogger,
	logHookReceived,
	logHookResponded,
	closeHookLogger,
} from '../utils/hookLogger.js';
import {usePermissionQueue} from './usePermissionQueue.js';
import {useQuestionQueue} from './useQuestionQueue.js';
import {
	dispatchEvent,
	tagSubagentEvents,
	type HandlerCallbacks,
	type HandlerContext,
} from './eventHandlers.js';

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
	const eventsRef = useRef<HookEventDisplay[]>([]);
	const expandedToolIdsRef = useRef<Set<string>>(new Set());
	const abortRef = useRef<AbortController>(new AbortController());
	const [events, setEvents] = useState<HookEventDisplay[]>([]);
	const [isServerRunning, setIsServerRunning] = useState(false);
	const [socketPath, setSocketPath] = useState<string | null>(null);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [rules, setRules] = useState<HookRule[]>([]);
	const rulesRef = useRef<HookRule[]>([]);

	// Keep refs in sync so callbacks see current state
	rulesRef.current = rules;
	eventsRef.current = events;

	// --- Extracted queues ---
	const {
		currentPermissionRequest,
		permissionQueueCount,
		enqueue: enqueuePermission,
		dequeue: dequeuePermission,
		removeAll: removeAllPermissions,
	} = usePermissionQueue(events);
	const {
		currentQuestionRequest,
		questionQueueCount,
		enqueue: enqueueQuestion,
		dequeue: dequeueQuestion,
		removeAll: removeAllQuestions,
	} = useQuestionQueue(events);

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

	const expandToolOutput = useCallback((toolId: string) => {
		const resolvedId =
			toolId === 'last'
				? [...eventsRef.current].reverse().find(e => e.toolUseId)?.toolUseId
				: toolId;
		if (!resolvedId || expandedToolIdsRef.current.has(resolvedId)) return;
		expandedToolIdsRef.current.add(resolvedId);

		const preEvent = eventsRef.current.find(
			e =>
				(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest') &&
				e.toolUseId === resolvedId,
		);
		const postEvent = eventsRef.current.find(
			e =>
				(e.hookName === 'PostToolUse' || e.hookName === 'PostToolUseFailure') &&
				e.toolUseId === resolvedId,
		);
		if (!postEvent && !preEvent) return;

		const expansionEvent: HookEventDisplay = {
			id: `expansion-${resolvedId}`,
			requestId: `expansion-${resolvedId}`,
			timestamp: new Date(),
			hookName: 'Expansion' as HookEventDisplay['hookName'],
			toolName: preEvent?.toolName,
			payload:
				postEvent?.payload ??
				preEvent?.payload ??
				({
					session_id: '',
					transcript_path: '',
					cwd: '',
					hook_event_name: 'Expansion',
				} as unknown as HookEventDisplay['payload']),
			status: 'passthrough',
			toolUseId: resolvedId,
		};

		setEvents(prev => [...prev, expansionEvent]);
	}, []);

	const expandedAgentIdRef = useRef<string | null>(null);

	const toggleSubagentExpansion = useCallback(() => {
		// Build set of agent_ids that have a SubagentStop (i.e., completed)
		const stoppedIds = new Set<string>();
		for (const e of eventsRef.current) {
			if (
				e.hookName === 'SubagentStop' &&
				isSubagentStopEvent(e.payload)
			) {
				stoppedIds.add(e.payload.agent_id);
			}
		}

		// Find the most recent SubagentStart that has completed
		const completedAgents = eventsRef.current.filter(
			e =>
				e.hookName === 'SubagentStart' &&
				isSubagentStartEvent(e.payload) &&
				stoppedIds.has(e.payload.agent_id),
		);
		const lastAgent = completedAgents.at(-1);
		if (!lastAgent || !isSubagentStartEvent(lastAgent.payload)) return;

		const agentId = lastAgent.payload.agent_id;
		const expansionId = `agent-expansion-${agentId}`;

		// Toggle: if same agent is already expanded, collapse it
		if (expandedAgentIdRef.current === agentId) {
			expandedAgentIdRef.current = null;
			setEvents(prev => prev.filter(e => e.id !== expansionId));
			return;
		}

		// Collapse previous if different agent
		if (expandedAgentIdRef.current) {
			const prevExpId = `agent-expansion-${expandedAgentIdRef.current}`;
			setEvents(prev => prev.filter(e => e.id !== prevExpId));
		}

		expandedAgentIdRef.current = agentId;

		// Collect child events for this agent
		const childEvents = eventsRef.current.filter(
			e => e.parentSubagentId === agentId,
		);
		const childLines = childEvents.map(e => {
			const tool = e.toolName ?? e.hookName;
			const blocked = e.status === 'blocked' ? ' [blocked]' : '';
			return `  ${tool}${blocked}`;
		});
		const message =
			`Agent ${lastAgent.payload.agent_type} (${agentId}) \u2014 ` +
			`${childEvents.length} child events:\n${childLines.join('\n')}`;

		const expansionEvent: HookEventDisplay = {
			id: expansionId,
			requestId: expansionId,
			timestamp: new Date(),
			hookName: 'Notification' as HookEventDisplay['hookName'],
			payload: {
				session_id: '',
				transcript_path: '',
				cwd: '',
				hook_event_name: 'Notification',
				message,
			} as unknown as HookEventDisplay['payload'],
			status: 'passthrough',
		};

		setEvents(prev => [...prev, expansionEvent]);
	}, []);

	const printTaskSnapshot = useCallback(() => {
		const taskEvents = eventsRef.current.filter(
			e =>
				e.hookName === 'PreToolUse' &&
				(e.toolName === 'TaskCreate' || e.toolName === 'TaskUpdate') &&
				!e.parentSubagentId,
		);

		if (taskEvents.length === 0) return;

		const snapshotEvent: HookEventDisplay = {
			id: `task-snapshot-${Date.now()}`,
			requestId: `task-snapshot-${Date.now()}`,
			timestamp: new Date(),
			hookName: 'Notification' as HookEventDisplay['hookName'],
			payload: {
				session_id: '',
				transcript_path: '',
				cwd: '',
				hook_event_name: 'Notification',
				message: '\u{1F4CB} Task list snapshot requested via :tasks command',
			} as unknown as HookEventDisplay['payload'],
			status: 'passthrough',
		};

		setEvents(prev => [...prev, snapshotEvent]);
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
			if (abortRef.current.signal.aborted) return;

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
			const isAllow = decision !== 'deny' && decision !== 'always-deny';

			// Persist "always" decisions as rules for future requests
			if (toolName) {
				if (decision === 'always-allow') {
					addRule({
						toolName,
						action: 'approve',
						addedBy: 'permission-dialog',
					});
				} else if (decision === 'always-deny') {
					addRule({
						toolName,
						action: 'deny',
						addedBy: 'permission-dialog',
					});
				} else if (decision === 'always-allow-server') {
					// Extract MCP server prefix and create a wildcard rule
					const serverMatch = /^(mcp__[^_]+(?:_[^_]+)*__)/.exec(toolName);
					if (serverMatch) {
						addRule({
							toolName: serverMatch[1] + '*',
							action: 'approve',
							addedBy: 'permission-dialog',
						});
					}
				}
			}

			// Send explicit allow/deny so Claude Code skips its own permission prompt
			const result = isAllow
				? createPreToolUseAllowResult()
				: createPreToolUseDenyResult('Denied by user via permission dialog');

			respond(requestId, result);
			dequeuePermission(requestId);
		},
		[respond, addRule, dequeuePermission],
	);

	// Resolve an AskUserQuestion request with the user's answers
	const resolveQuestion = useCallback(
		(requestId: string, answers: Record<string, string>) => {
			const result = createAskUserQuestionResult(answers);
			respond(requestId, result);
			dequeueQuestion(requestId);
		},
		[respond, dequeueQuestion],
	);

	// Get pending events
	const pendingEvents = events.filter(e => e.status === 'pending');

	useEffect(() => {
		// Fresh AbortController for this effect cycle
		abortRef.current = new AbortController();

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

		// ── Server creation ─────────────────────────────────────────────

		const server = net.createServer((socket: net.Socket) => {
			// Build per-socket callbacks that close over the socket
			const callbacks: HandlerCallbacks = {
				signal: abortRef.current.signal,
				getRules: () => rulesRef.current,
				storeWithAutoPassthrough: (ctx: HandlerContext) => {
					const timeoutId = setTimeout(() => {
						respond(ctx.envelope.request_id, createPassthroughResult());
					}, AUTO_PASSTHROUGH_MS);
					storePending(
						ctx.envelope.request_id,
						socket,
						ctx.displayEvent,
						ctx.receiveTimestamp,
						timeoutId,
					);
				},
				storeWithoutPassthrough: (ctx: HandlerContext) => {
					storePending(
						ctx.envelope.request_id,
						socket,
						ctx.displayEvent,
						ctx.receiveTimestamp,
						undefined as unknown as ReturnType<typeof setTimeout>,
					);
				},
				addEvent,
				respond,
				enqueuePermission,
				enqueueQuestion,
				setCurrentSessionId,
				onTranscriptParsed: (
					eventId: string,
					summary: HookEventDisplay['transcriptSummary'],
				) => {
					if (!abortRef.current.signal.aborted) {
						setEvents(prev =>
							prev.map(e =>
								e.id === eventId ? {...e, transcriptSummary: summary} : e,
							),
						);
					}
				},
			};

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

					// Build handler context
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
						receiveTimestamp: Date.now(),
					};

					// Track active subagents and tag child events
					activeSubagentStackRef.current = tagSubagentEvents(
						envelope,
						ctx.displayEvent,
						activeSubagentStackRef.current,
					);

					// Dispatch to handler chain
					dispatchEvent(ctx, callbacks);
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
				if (closedRequestIds.length > 0 && !abortRef.current.signal.aborted) {
					removeAllPermissions(closedRequestIds);
					removeAllQuestions(closedRequestIds);
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
			// Signal abort to prevent state updates
			abortRef.current.abort();

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
	}, [
		projectDir,
		instanceId,
		respond,
		enqueuePermission,
		removeAllPermissions,
		enqueueQuestion,
		removeAllQuestions,
	]);

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
		permissionQueueCount,
		resolvePermission,
		currentQuestionRequest,
		questionQueueCount,
		resolveQuestion,
		expandToolOutput,
		toggleSubagentExpansion,
		printTaskSnapshot,
	};
}
