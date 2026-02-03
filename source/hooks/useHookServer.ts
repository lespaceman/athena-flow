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
	type PostToolUseEvent,
	type PostToolUseFailureEvent,
	createPassthroughResult,
	createPreToolUseAllowResult,
	createPreToolUseDenyResult,
	isValidHookEventEnvelope,
	generateId,
	isToolEvent,
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

const AUTO_PASSTHROUGH_MS = 250; // Auto-passthrough before forwarder timeout (300ms)
const MAX_EVENTS = 100; // Maximum events to keep in memory

/**
 * Find a matching PreToolUse event for a PostToolUse/PostToolUseFailure.
 * 1. Try matching by tool_use_id (preferred)
 * 2. Fallback: most recent unmatched PreToolUse with same tool_name
 * "Unmatched" means no postToolPayload has been merged yet.
 */
function findMatchingPreToolUse(
	events: HookEventDisplay[],
	toolUseId: string | undefined,
	toolName: string,
): HookEventDisplay | undefined {
	// Try tool_use_id match first
	if (toolUseId) {
		const byId = events.find(
			e =>
				(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest') &&
				e.toolUseId === toolUseId &&
				!e.postToolPayload,
		);
		if (byId) return byId;
	}

	// Fallback: most recent unmatched PreToolUse with same tool_name (search from end)
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i]!;
		if (
			(e.hookName === 'PreToolUse' || e.hookName === 'PermissionRequest') &&
			e.toolName === toolName &&
			!e.postToolPayload
		) {
			return e;
		}
	}

	return undefined;
}

export function useHookServer(
	projectDir: string,
	instanceId: number,
): UseHookServerResult {
	const serverRef = useRef<net.Server | null>(null);
	const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
	const isMountedRef = useRef(true); // Track if component is mounted
	const [events, setEvents] = useState<HookEventDisplay[]>([]);
	const eventsRef = useRef<HookEventDisplay[]>([]);
	eventsRef.current = events;
	const [isServerRunning, setIsServerRunning] = useState(false);
	const [socketPath, setSocketPath] = useState<string | null>(null);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [rules, setRules] = useState<HookRule[]>([]);
	const rulesRef = useRef<HookRule[]>([]);

	// Keep ref in sync so the socket handler sees current rules
	rulesRef.current = rules;

	// Permission queue -- requestIds waiting for user decision
	const [permissionQueue, setPermissionQueue] = useState<string[]>([]);

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
			const statusMap: Record<string, HookEventDisplay['status']> = {
				passthrough: 'passthrough',
				block_with_stderr: 'blocked',
				json_output: 'json_output',
			};

			setEvents(prev =>
				prev.map(e =>
					e.requestId === requestId
						? {
								...e,
								status: statusMap[result.action] ?? 'passthrough',
								result,
							}
						: e,
				),
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

		// Create server
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
					const receiveTimestamp = Date.now();

					logHookReceived(envelope);

					// Create display event
					const payload = envelope.payload;
					const displayEvent: HookEventDisplay = {
						id: generateId(),
						requestId: envelope.request_id,
						timestamp: new Date(envelope.ts),
						hookName: envelope.hook_event_name,
						toolName: isToolEvent(payload) ? payload.tool_name : undefined,
						toolUseId: isToolEvent(payload) ? payload.tool_use_id : undefined,
						payload,
						status: 'pending',
					};

					// Merge PostToolUse/PostToolUseFailure into matching PreToolUse
					if (
						(envelope.hook_event_name === 'PostToolUse' ||
							envelope.hook_event_name === 'PostToolUseFailure') &&
						isToolEvent(payload)
					) {
						const match = findMatchingPreToolUse(
							eventsRef.current,
							payload.tool_use_id,
							payload.tool_name,
						);

						if (match) {
							const timeoutId = setTimeout(() => {
								respond(envelope.request_id, createPassthroughResult());
							}, AUTO_PASSTHROUGH_MS);

							storePending(
								envelope.request_id,
								socket,
								displayEvent,
								receiveTimestamp,
								timeoutId,
							);

							// Merge into the matching PreToolUse entry
							const isFailed =
								envelope.hook_event_name === 'PostToolUseFailure';
							setEvents(prev =>
								prev.map(e =>
									e.id === match.id
										? {
												...e,
												postToolPayload: payload as
													| PostToolUseEvent
													| PostToolUseFailureEvent,
												postToolRequestId: envelope.request_id,
												postToolTimestamp: new Date(envelope.ts),
												postToolFailed: isFailed,
											}
										: e,
								),
							);
							return;
						}
						// No match found -- fall through to add as standalone orphan entry
					}

					// Check rules for PreToolUse events
					if (
						envelope.hook_event_name === 'PreToolUse' &&
						isToolEvent(payload)
					) {
						const matchedRule = matchRule(rulesRef.current, payload.tool_name);
						if (matchedRule) {
							const result =
								matchedRule.action === 'deny'
									? createPreToolUseDenyResult(
											`Blocked by rule: ${matchedRule.addedBy}`,
										)
									: createPreToolUseAllowResult();

							// Store pending briefly so respond() can find it
							const placeholder = setTimeout(() => {}, 0);
							storePending(
								envelope.request_id,
								socket,
								displayEvent,
								receiveTimestamp,
								placeholder,
							);
							addEvent(displayEvent);
							respond(envelope.request_id, result);
							return;
						}
					}

					// Check if permission is required for this tool
					const needsPermission =
						envelope.hook_event_name === 'PreToolUse' &&
						isToolEvent(payload) &&
						isPermissionRequired(payload.tool_name, rulesRef.current);

					if (needsPermission) {
						// No auto-passthrough timeout for permission requests
						const noTimeout = setTimeout(() => {}, 0);
						clearTimeout(noTimeout);
						storePending(
							envelope.request_id,
							socket,
							displayEvent,
							receiveTimestamp,
							noTimeout,
						);
						addEvent(displayEvent);
						setPermissionQueue(prev => [...prev, envelope.request_id]);
						return;
					}

					// Default: auto-passthrough after timeout
					const timeoutId = setTimeout(() => {
						respond(envelope.request_id, createPassthroughResult());
					}, AUTO_PASSTHROUGH_MS);

					storePending(
						envelope.request_id,
						socket,
						displayEvent,
						receiveTimestamp,
						timeoutId,
					);
					addEvent(displayEvent);

					// Capture session ID from SessionStart events for resume support
					if (envelope.hook_event_name === 'SessionStart') {
						setCurrentSessionId(envelope.session_id);
					}

					// Asynchronously enrich SessionEnd events with transcript data
					if (envelope.hook_event_name === 'SessionEnd') {
						const transcriptPath = envelope.payload.transcript_path;
						if (transcriptPath) {
							parseTranscriptFile(transcriptPath)
								.then(summary => {
									if (!isMountedRef.current) return;
									setEvents(prev =>
										prev.map(e =>
											e.id === displayEvent.id
												? {...e, transcriptSummary: summary}
												: e,
										),
									);
								})
								.catch(err => {
									console.error(
										'[SessionEnd] Failed to parse transcript:',
										err,
									);
								});
						} else {
							setEvents(prev =>
								prev.map(e =>
									e.id === displayEvent.id
										? {
												...e,
												transcriptSummary: {
													lastAssistantText: null,
													lastAssistantTimestamp: null,
													messageCount: 0,
													toolCallCount: 0,
													error: 'No transcript path provided',
												},
											}
										: e,
								),
							);
						}
					}
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

				// Remove closed requests from the permission queue so the
				// dialog does not get stuck showing a dead request.
				if (closedRequestIds.length > 0 && isMountedRef.current) {
					setPermissionQueue(prev =>
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
	};
}
