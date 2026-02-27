import {describe, it, expect, afterEach, vi, beforeEach} from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
	type HookEventEnvelope,
	type HookResultEnvelope,
	type HookResultPayload,
	generateId,
	createPermissionRequestAllowResult,
} from '../types/hooks/index';
import {matchRule, type HookRule} from '../types/rules';

// Suppress console.error from hook logger / server internals
vi.spyOn(console, 'error').mockImplementation(() => {});

/**
 * Integration tests for the PermissionRequest handler logic.
 *
 * Because the handlers live inside a React useEffect in useHookServer,
 * we test them by starting a minimal net.Server that mirrors the
 * PermissionRequest handler dispatch path, sending NDJSON envelopes
 * over a Unix Domain Socket, and asserting on the response.
 */

let tempDir: string;
let sockPath: string;

beforeEach(() => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-test-'));
	sockPath = path.join(tempDir, 'test.sock');
});

afterEach(() => {
	try {
		fs.unlinkSync(sockPath);
	} catch {
		/* may not exist */
	}
	try {
		fs.rmdirSync(tempDir);
	} catch {
		/* may not be empty */
	}
});

function makeEnvelope(
	hookEventName: string,
	payload: Record<string, unknown>,
): HookEventEnvelope {
	return {
		request_id: generateId(),
		ts: Date.now(),
		session_id: 'test-session',
		hook_event_name: hookEventName as HookEventEnvelope['hook_event_name'],
		payload: payload as HookEventEnvelope['payload'],
	};
}

function makeToolPayload(
	hookEventName: string,
	toolName: string,
): Record<string, unknown> {
	return {
		session_id: 'test-session',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: hookEventName,
		tool_name: toolName,
		tool_input: {command: 'ls'},
	};
}

/** Send an envelope over a UDS and return the parsed result envelope. */
function sendEnvelope(
	socket: string,
	envelope: HookEventEnvelope,
): Promise<HookResultEnvelope> {
	return new Promise((resolve, reject) => {
		const client = new net.Socket();
		let data = '';
		const timeout = setTimeout(() => {
			client.destroy();
			reject(new Error('timeout waiting for response'));
		}, 5000);

		client.on('data', (chunk: Buffer) => {
			data += chunk.toString();
			const lines = data.split('\n');
			if (lines.length > 1 && lines[0]) {
				clearTimeout(timeout);
				client.destroy();
				resolve(JSON.parse(lines[0]!) as HookResultEnvelope);
			}
		});

		client.on('error', err => {
			clearTimeout(timeout);
			reject(err);
		});

		client.connect(socket, () => {
			client.write(JSON.stringify(envelope) + '\n');
		});
	});
}

/**
 * Minimal server that mirrors the PermissionRequest handler logic
 * from useHookServer so we can test the dispatch behaviour in isolation.
 */
function startTestServer(
	sock: string,
	rules: Array<{
		toolName: string;
		action: 'approve' | 'deny';
		addedBy: string;
	}> = [],
): net.Server {
	const fullRules: HookRule[] = rules.map((r, i) => ({
		id: `rule-${i}`,
		...r,
	}));

	const server = net.createServer((socket: net.Socket) => {
		let buf = '';
		socket.on('data', (chunk: Buffer) => {
			buf += chunk.toString();
			const lines = buf.split('\n');
			if (lines.length <= 1 || !lines[0]) return;
			buf = lines.slice(1).join('\n');

			const envelope = JSON.parse(lines[0]!) as HookEventEnvelope;

			let result: HookResultPayload;
			if (envelope.hook_event_name === 'PermissionRequest') {
				const payload = envelope.payload as {tool_name?: string};
				const toolName = payload.tool_name;
				if (toolName) {
					const matched = matchRule(fullRules, toolName);
					if (matched?.action === 'deny') {
						result = {
							action: 'block_with_stderr',
							stderr: `Blocked by rule: ${matched.addedBy}`,
						};
					} else {
						result = createPermissionRequestAllowResult();
					}
				} else {
					result = {action: 'passthrough'};
				}
			} else {
				result = {action: 'passthrough'};
			}

			const response: HookResultEnvelope = {
				request_id: envelope.request_id,
				ts: Date.now(),
				payload: result,
			};

			socket.write(JSON.stringify(response) + '\n');
			socket.end();
		});
	});

	server.listen(sock);
	return server;
}

function waitForServer(server: net.Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.on('listening', resolve);
		server.on('error', reject);
	});
}

describe('PermissionRequest handler', () => {
	let server: net.Server;

	afterEach(() => {
		server?.close();
	});

	it('auto-allows PermissionRequest for safe tools (e.g. AskUserQuestion)', async () => {
		server = startTestServer(sockPath);
		await waitForServer(server);

		const envelope = makeEnvelope(
			'PermissionRequest',
			makeToolPayload('PermissionRequest', 'AskUserQuestion'),
		);
		const result = await sendEnvelope(sockPath, envelope);

		expect(result.payload.action).toBe('json_output');
		const output = result.payload.stdout_json as {
			hookSpecificOutput: {
				hookEventName: string;
				decision: {behavior: string};
			};
		};
		expect(output.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
		expect(output.hookSpecificOutput.decision.behavior).toBe('allow');
	});

	it('auto-allows PermissionRequest for dangerous tools without deny rules', async () => {
		server = startTestServer(sockPath);
		await waitForServer(server);

		const envelope = makeEnvelope(
			'PermissionRequest',
			makeToolPayload('PermissionRequest', 'Bash'),
		);
		const result = await sendEnvelope(sockPath, envelope);

		expect(result.payload.action).toBe('json_output');
		const output = result.payload.stdout_json as {
			hookSpecificOutput: {
				hookEventName: string;
				decision: {behavior: string};
			};
		};
		expect(output.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
		expect(output.hookSpecificOutput.decision.behavior).toBe('allow');
	});

	it('blocks PermissionRequest when a deny rule matches', async () => {
		server = startTestServer(sockPath, [
			{toolName: 'Bash', action: 'deny', addedBy: 'test-policy'},
		]);
		await waitForServer(server);

		const envelope = makeEnvelope(
			'PermissionRequest',
			makeToolPayload('PermissionRequest', 'Bash'),
		);
		const result = await sendEnvelope(sockPath, envelope);

		expect(result.payload.action).toBe('block_with_stderr');
		expect(result.payload.stderr).toContain('Blocked by rule');
		expect(result.payload.stderr).toContain('test-policy');
	});

	it('allows PermissionRequest even when an approve rule matches (auto-allow)', async () => {
		server = startTestServer(sockPath, [
			{toolName: 'Bash', action: 'approve', addedBy: 'test-policy'},
		]);
		await waitForServer(server);

		const envelope = makeEnvelope(
			'PermissionRequest',
			makeToolPayload('PermissionRequest', 'Bash'),
		);
		const result = await sendEnvelope(sockPath, envelope);

		// Approve rules don't change behavior — PermissionRequest auto-allows regardless
		expect(result.payload.action).toBe('json_output');
		const output = result.payload.stdout_json as {
			hookSpecificOutput: {
				hookEventName: string;
				decision: {behavior: string};
			};
		};
		expect(output.hookSpecificOutput.decision.behavior).toBe('allow');
	});

	it('passthroughs non-PermissionRequest events', async () => {
		server = startTestServer(sockPath);
		await waitForServer(server);

		const envelope = makeEnvelope('Notification', {
			session_id: 'test-session',
			transcript_path: '/tmp/t.jsonl',
			cwd: '/project',
			hook_event_name: 'Notification',
			message: 'hello',
		});
		const result = await sendEnvelope(sockPath, envelope);

		expect(result.payload.action).toBe('passthrough');
	});
});
