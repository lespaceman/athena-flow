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
	createPreToolUseDenyResult,
	isValidHookEventEnvelope,
	generateId,
	isToolEvent,
} from '../types/hooks/index.js';
import {
	type PendingRequest,
	type UseHookServerResult,
} from '../types/server.js';
import {type HookRule} from '../types/rules.js';
import {parseTranscriptFile} from '../utils/transcriptParser.js';
import {
	initHookLogger,
	logHookReceived,
	logHookResponded,
	closeHookLogger,
} from '../utils/hookLogger.js';

// Re-export type for backwards compatibility
export type {UseHookServerResult};

const AUTO_PASSTHROUGH_MS = 250; // Auto-passthrough before forwarder timeout (300ms)
const MAX_EVENTS = 100; // Maximum events to keep in memory

/**
 * Find the first matching rule for a tool name.
 * Deny rules are checked first, then approve. First match wins.
 */
export function matchRule(
	rules: HookRule[],
	toolName: string,
): HookRule | undefined {
	// Check deny rules first
	const denyMatch = rules.find(
		r => r.action === 'deny' && (r.toolName === toolName || r.toolName === '*'),
	);
	if (denyMatch) return denyMatch;

	// Then approve rules
	return rules.find(
		r =>
			r.action === 'approve' && (r.toolName === toolName || r.toolName === '*'),
	);
}

export function useHookServer(
	projectDir: string,
	instanceId: number,
): UseHookServerResult {
	const serverRef = useRef<net.Server | null>(null);
	const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
	const isMountedRef = useRef(true); // Track if component is mounted
	const [events, setEvents] = useState<HookEventDisplay[]>([]);
	const [isServerRunning, setIsServerRunning] = useState(false);
	const [socketPath, setSocketPath] = useState<string | null>(null);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [rules, setRules] = useState<HookRule[]>([]);
	const rulesRef = useRef<HookRule[]>([]);

	// Keep ref in sync so the socket handler sees current rules
	rulesRef.current = rules;

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

		// Create server
		const server = net.createServer((socket: net.Socket) => {
			let data = '';

			socket.on('data', (chunk: Buffer) => {
				data += chunk.toString();

				// Check for complete NDJSON line
				const lines = data.split('\n');
				if (lines.length > 1 && lines[0]) {
					try {
						const parsed: unknown = JSON.parse(lines[0]);

						// Validate envelope structure before processing
						if (isValidHookEventEnvelope(parsed)) {
							const envelope = parsed as HookEventEnvelope;
							const receiveTimestamp = Date.now();

							// Log received event
							logHookReceived(envelope);

							// Create display event
							const payload = envelope.payload;
							const displayEvent: HookEventDisplay = {
								id: generateId(),
								requestId: envelope.request_id,
								timestamp: new Date(envelope.ts),
								hookName: envelope.hook_event_name,
								toolName: isToolEvent(payload) ? payload.tool_name : undefined,
								payload: payload,
								status: 'pending',
							};

							// Check rules for PreToolUse events
							if (
								envelope.hook_event_name === 'PreToolUse' &&
								isToolEvent(payload)
							) {
								const matchedRule = matchRule(
									rulesRef.current,
									payload.tool_name,
								);
								if (matchedRule) {
									const result =
										matchedRule.action === 'deny'
											? createPreToolUseDenyResult(
													`Blocked by rule: ${matchedRule.addedBy}`,
												)
											: createPassthroughResult();

									// Store pending briefly so respond() can find it
									pendingRequestsRef.current.set(envelope.request_id, {
										requestId: envelope.request_id,
										socket,
										timeoutId: setTimeout(() => {}, 0), // placeholder
										event: displayEvent,
										receiveTimestamp,
									});

									// Add event and respond immediately
									setEvents(prev => {
										const updated = [...prev, displayEvent];
										if (updated.length > MAX_EVENTS) {
											return updated.slice(-MAX_EVENTS);
										}
										return updated;
									});

									respond(envelope.request_id, result);

									// Reset for next message
									data = lines.slice(1).join('\n');
									return;
								}
							}

							// Set up auto-passthrough timeout
							const timeoutId = setTimeout(() => {
								respond(envelope.request_id, createPassthroughResult());
							}, AUTO_PASSTHROUGH_MS);

							// Store pending request
							pendingRequestsRef.current.set(envelope.request_id, {
								requestId: envelope.request_id,
								socket,
								timeoutId,
								event: displayEvent,
								receiveTimestamp,
							});

							// Add to events with pruning to prevent memory leak
							setEvents(prev => {
								const updated = [...prev, displayEvent];
								// Keep only the most recent MAX_EVENTS
								if (updated.length > MAX_EVENTS) {
									return updated.slice(-MAX_EVENTS);
								}
								return updated;
							});

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
											// Log error for debugging, but don't crash
											console.error(
												'[SessionEnd] Failed to parse transcript:',
												err,
											);
										});
								} else {
									// No transcript path - set error state
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
						} else {
							// Invalid envelope structure, close connection
							socket.end();
						}
					} catch {
						// Invalid JSON, ignore
						socket.end();
					}

					// Reset for next message
					data = lines.slice(1).join('\n');
				}
			});

			socket.on('error', () => {
				// Socket error, cleanup handled by close
			});

			socket.on('close', () => {
				// Clean up any pending requests for this socket
				for (const [reqId, pending] of pendingRequestsRef.current) {
					if (pending.socket === socket) {
						clearTimeout(pending.timeoutId);
						pendingRequestsRef.current.delete(reqId);
					}
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
	};
}
