#!/usr/bin/env node
/**
 * Hook Forwarder - Standalone script invoked by Claude Code hooks
 *
 * Flow:
 * 1. Receives hook input JSON via stdin from Claude Code
 * 2. Connects to Ink CLI via Unix Domain Socket
 * 3. Sends hook_event message
 * 4. Waits for hook_result response
 * 5. Returns result via stdout/stderr + exit code to Claude Code
 *
 * Exit codes:
 * - 0: passthrough or json_output (with stdout JSON)
 * - 2: block_with_stderr (with stderr message)
 */

import * as net from 'node:net';
import * as path from 'node:path';

import {
	PROTOCOL_VERSION,
	type ClaudeHookInput,
	type HookEventEnvelope,
	type HookResultEnvelope,
	generateId,
} from './types/hooks.js';

const SOCKET_TIMEOUT_MS = 300;
const SOCKET_FILENAME = 'ink.sock';

function getSocketPath(): string {
	const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
	return path.join(projectDir, '.claude', 'run', SOCKET_FILENAME);
}

async function readStdin(): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (chunk: string) => {
			data += chunk;
		});
		process.stdin.on('end', () => {
			resolve(data);
		});
		process.stdin.on('error', reject);
	});
}

async function connectAndSend(
	socketPath: string,
	envelope: HookEventEnvelope,
): Promise<HookResultEnvelope | null> {
	return new Promise(resolve => {
		const socket = new net.Socket();
		let responseData = '';
		let resolved = false;

		const cleanup = () => {
			if (!resolved) {
				resolved = true;
				socket.destroy();
				resolve(null);
			}
		};

		// Set timeout for entire operation
		const timeoutId = setTimeout(cleanup, SOCKET_TIMEOUT_MS);

		socket.on('connect', () => {
			// Send the envelope as NDJSON (newline-delimited JSON)
			socket.write(JSON.stringify(envelope) + '\n');
		});

		socket.on('data', (chunk: Buffer) => {
			responseData += chunk.toString();
			// Check for newline (NDJSON delimiter)
			const lines = responseData.split('\n');
			if (lines.length > 1 && lines[0]) {
				clearTimeout(timeoutId);
				resolved = true;
				socket.destroy();
				try {
					const result = JSON.parse(lines[0]) as HookResultEnvelope;
					resolve(result);
				} catch {
					resolve(null);
				}
			}
		});

		socket.on('error', () => {
			clearTimeout(timeoutId);
			cleanup();
		});

		socket.on('close', () => {
			clearTimeout(timeoutId);
			if (!resolved) {
				resolved = true;
				resolve(null);
			}
		});

		// Connect to the socket
		socket.connect(socketPath);
	});
}

async function main(): Promise<void> {
	try {
		// Read stdin
		const stdinData = await readStdin();
		if (!stdinData.trim()) {
			// No input, passthrough
			process.exit(0);
		}

		// Parse hook input from Claude Code
		let hookInput: ClaudeHookInput;
		try {
			hookInput = JSON.parse(stdinData) as ClaudeHookInput;
		} catch {
			// Invalid JSON, passthrough
			process.exit(0);
			return; // TypeScript: unreachable, but helps with control flow analysis
		}

		// Build the envelope
		const requestId = generateId();
		const envelope: HookEventEnvelope = {
			v: PROTOCOL_VERSION,
			kind: 'hook_event',
			request_id: requestId,
			ts: Date.now(),
			session_id: hookInput.session_id ?? 'unknown',
			hook_event_name: hookInput.hook_event_name,
			payload: hookInput,
		};

		// Connect to Ink CLI and send
		const socketPath = getSocketPath();
		const result = await connectAndSend(socketPath, envelope);

		// Handle result
		if (!result || result.payload.action === 'passthrough') {
			// Passthrough: exit 0, no output
			process.exit(0);
		}

		if (result.payload.action === 'block_with_stderr') {
			// Block: exit 2, stderr message
			process.stderr.write(result.payload.stderr ?? 'Blocked by Ink CLI');
			process.exit(2);
		}

		if (result.payload.action === 'json_output') {
			// JSON output: exit 0, stdout JSON
			if (result.payload.stdout_json) {
				process.stdout.write(JSON.stringify(result.payload.stdout_json));
			}
			process.exit(0);
		}

		// Unknown action, passthrough
		process.exit(0);
	} catch {
		// Any error, passthrough to avoid blocking Claude Code
		process.exit(0);
	}
}

main();
