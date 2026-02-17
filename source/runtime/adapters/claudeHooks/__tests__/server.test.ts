import {describe, it, expect, afterEach} from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {createClaudeHookRuntime} from '../index.js';
import type {RuntimeEvent, RuntimeDecision} from '../../../types.js';

function makeTmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'athena-test-'));
}

describe('createClaudeHookRuntime', () => {
	let cleanup: (() => void)[] = [];

	afterEach(() => {
		cleanup.forEach(fn => fn());
		cleanup = [];
	});

	it('starts and reports running status', async () => {
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 99});
		runtime.start();
		cleanup.push(() => runtime.stop());

		await new Promise(r => setTimeout(r, 100));
		expect(runtime.getStatus()).toBe('running');
	});

	it('emits RuntimeEvent when NDJSON arrives on socket', async () => {
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 98});
		const events: RuntimeEvent[] = [];
		runtime.onEvent(e => events.push(e));
		runtime.start();
		cleanup.push(() => runtime.stop());

		await new Promise(r => setTimeout(r, 100));

		const sockPath = path.join(projectDir, '.claude', 'run', 'ink-98.sock');
		const client = net.createConnection(sockPath);
		await new Promise<void>(resolve => client.on('connect', resolve));

		const envelope = {
			request_id: 'r1',
			ts: Date.now(),
			session_id: 's1',
			hook_event_name: 'Notification',
			payload: {
				hook_event_name: 'Notification',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				message: 'hello',
			},
		};
		client.write(JSON.stringify(envelope) + '\n');

		await new Promise(r => setTimeout(r, 200));
		expect(events).toHaveLength(1);
		expect(events[0]!.hookName).toBe('Notification');
		expect(events[0]!.id).toBe('r1');

		client.end();
	});

	it('sends HookResultEnvelope back when decision is provided', async () => {
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 97});
		const events: RuntimeEvent[] = [];
		runtime.onEvent(e => events.push(e));
		runtime.start();
		cleanup.push(() => runtime.stop());

		await new Promise(r => setTimeout(r, 100));

		const sockPath = path.join(projectDir, '.claude', 'run', 'ink-97.sock');
		const client = net.createConnection(sockPath);
		await new Promise<void>(resolve => client.on('connect', resolve));

		const envelope = {
			request_id: 'r2',
			ts: Date.now(),
			session_id: 's1',
			hook_event_name: 'PermissionRequest',
			payload: {
				hook_event_name: 'PermissionRequest',
				session_id: 's1',
				transcript_path: '/tmp/t.jsonl',
				cwd: '/project',
				tool_name: 'Bash',
				tool_input: {command: 'rm -rf /'},
			},
		};
		client.write(JSON.stringify(envelope) + '\n');

		await new Promise(r => setTimeout(r, 200));
		expect(events).toHaveLength(1);

		// Collect response
		const responseData: string[] = [];
		client.on('data', chunk => responseData.push(chunk.toString()));

		const decision: RuntimeDecision = {
			type: 'json',
			source: 'user',
			intent: {kind: 'permission_allow'},
		};
		runtime.sendDecision('r2', decision);

		await new Promise(r => setTimeout(r, 200));
		expect(responseData.length).toBeGreaterThan(0);
		const result = JSON.parse(responseData.join('').trim());
		expect(result.request_id).toBe('r2');
		expect(result.payload.action).toBe('json_output');

		client.end();
	});

	it('stops cleanly', async () => {
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 96});
		runtime.start();
		await new Promise(r => setTimeout(r, 100));
		runtime.stop();
		expect(runtime.getStatus()).toBe('stopped');
	});
});
