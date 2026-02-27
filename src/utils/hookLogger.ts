/**
 * Hook event debug logger.
 *
 * Writes hook events to an NDJSON file for real-time debugging with `tail -f`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {type HookEventEnvelope} from '../types/hooks/index';

let logFilePath: string | null = null;
let isInitialized = false;

/**
 * Log entry for received hook events.
 */
export type HookReceivedLogEntry = {
	ts: string;
	type: 'received';
	event: string;
	request_id: string;
	session_id: string;
	tool?: string;
	payload: unknown;
};

/**
 * Log entry for responded hook events.
 */
export type HookRespondedLogEntry = {
	ts: string;
	type: 'responded';
	request_id: string;
	action: string;
	response_time_ms: number;
};

export type HookLogEntry = HookReceivedLogEntry | HookRespondedLogEntry;

/**
 * Initialize the hook logger.
 *
 * Creates the log directory if needed and sets up the log file path.
 *
 * @param projectDir - The project directory (e.g., cwd)
 */
export function initHookLogger(projectDir: string): void {
	const logDir = path.join(projectDir, '.claude', 'logs');

	// Create log directory if it doesn't exist
	try {
		fs.mkdirSync(logDir, {recursive: true});
	} catch {
		// Directory might exist or creation failed, continue anyway
	}

	logFilePath = path.join(logDir, 'hooks.jsonl');
	isInitialized = true;
}

/**
 * Log a received hook event.
 *
 * @param envelope - The validated hook event envelope
 */
export function logHookReceived(envelope: HookEventEnvelope): void {
	if (!isInitialized || !logFilePath) return;

	const entry: HookReceivedLogEntry = {
		ts: new Date().toISOString(),
		type: 'received',
		event: envelope.hook_event_name,
		request_id: envelope.request_id,
		session_id: envelope.session_id,
		payload: envelope.payload,
	};

	// Add tool name if present in payload
	const payload = envelope.payload as Record<string, unknown>;
	if (typeof payload['tool_name'] === 'string') {
		entry.tool = payload['tool_name'];
	}

	writeLogEntry(entry);
}

/**
 * Log a response to a hook event.
 *
 * @param requestId - The request ID of the event being responded to
 * @param action - The action taken (passthrough, block_with_stderr, json_output)
 * @param responseTimeMs - Time in milliseconds since the event was received
 */
export function logHookResponded(
	requestId: string,
	action: string,
	responseTimeMs: number,
): void {
	if (!isInitialized || !logFilePath) return;

	const entry: HookRespondedLogEntry = {
		ts: new Date().toISOString(),
		type: 'responded',
		request_id: requestId,
		action,
		response_time_ms: responseTimeMs,
	};

	writeLogEntry(entry);
}

/**
 * Write a log entry to the file.
 *
 * Uses synchronous append to ensure ordering of entries.
 */
function writeLogEntry(entry: HookLogEntry): void {
	if (!logFilePath) return;

	try {
		fs.appendFileSync(logFilePath, JSON.stringify(entry) + '\n');
	} catch {
		// Log write failed, ignore to avoid disrupting the main application
	}
}

/**
 * Close the hook logger.
 *
 * Resets the logger state. Primarily used for testing.
 */
export function closeHookLogger(): void {
	logFilePath = null;
	isInitialized = false;
}

/**
 * Get the current log file path.
 *
 * Primarily used for testing.
 */
export function getLogFilePath(): string | null {
	return logFilePath;
}
