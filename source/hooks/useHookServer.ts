import {useEffect, useRef, useCallback, useState} from 'react';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
	PROTOCOL_VERSION,
	type HookResultEnvelope,
	type HookResultPayload,
	type HookEventDisplay,
	createPassthroughResult,
	isValidHookEventEnvelope,
	generateId,
} from '../types/hooks.js';
import {parseTranscriptFile} from '../utils/transcriptParser.js';

const SOCKET_FILENAME = 'ink.sock';
const AUTO_PASSTHROUGH_MS = 250; // Auto-passthrough before forwarder timeout (300ms)
const MAX_EVENTS = 100; // Maximum events to keep in memory

type PendingRequest = {
	requestId: string;
	socket: net.Socket;
	timeoutId: ReturnType<typeof setTimeout>;
	event: HookEventDisplay;
};

export type UseHookServerResult = {
	events: HookEventDisplay[];
	isServerRunning: boolean;
	respond: (requestId: string, result: HookResultPayload) => void;
	pendingEvents: HookEventDisplay[];
	socketPath: string | null;
};

export function useHookServer(projectDir: string): UseHookServerResult {
	const serverRef = useRef<net.Server | null>(null);
	const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
	const isMountedRef = useRef(true); // Track if component is mounted
	const [events, setEvents] = useState<HookEventDisplay[]>([]);
	const [isServerRunning, setIsServerRunning] = useState(false);
	const [socketPath, setSocketPath] = useState<string | null>(null);

	// Respond to a hook event
	const respond = useCallback(
		(requestId: string, result: HookResultPayload) => {
			const pending = pendingRequestsRef.current.get(requestId);
			if (!pending) return;

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

		// Create socket directory
		const socketDir = path.join(projectDir, '.claude', 'run');
		const sockPath = path.join(socketDir, SOCKET_FILENAME);

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
							const envelope = parsed;

							// Create display event
							const displayEvent: HookEventDisplay = {
								id: generateId(),
								requestId: envelope.request_id,
								timestamp: new Date(envelope.ts),
								hookName: envelope.hook_event_name,
								toolName: envelope.payload.tool_name,
								payload: envelope.payload,
								status: 'pending',
							};

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
		};
	}, [projectDir, respond]);

	return {
		events,
		isServerRunning,
		respond,
		pendingEvents,
		socketPath,
	};
}
