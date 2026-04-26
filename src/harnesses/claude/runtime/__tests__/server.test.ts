import {describe, it, expect, afterEach} from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {createClaudeHookRuntime} from '..';
import {resolveHookSocketPath} from '../socketPath';
import type {
	RuntimeEvent,
	RuntimeDecision,
} from '../../../../core/runtime/types';
import type {RuntimeConnector} from '../../../../core/runtime/connector';

function makeTmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'athena-test-'));
}

describe('createClaudeHookRuntime', () => {
	let cleanup: (() => void)[] = [];
	let previousRuntimeDir: string | undefined;
	let runtimeDirOverridden = false;

	afterEach(() => {
		delete process.env['ATHENA_SIMULATE_HOOK_SERVER_FAILURE'];
		if (runtimeDirOverridden) {
			if (previousRuntimeDir === undefined) {
				delete process.env['ATHENA_RUNTIME_DIR'];
			} else {
				process.env['ATHENA_RUNTIME_DIR'] = previousRuntimeDir;
			}
		}
		previousRuntimeDir = undefined;
		runtimeDirOverridden = false;
		cleanup.forEach(fn => fn());
		cleanup = [];
	});

	function useRuntimeDir(): string {
		previousRuntimeDir = process.env['ATHENA_RUNTIME_DIR'];
		runtimeDirOverridden = true;
		const runtimeDir = makeTmpDir();
		process.env['ATHENA_RUNTIME_DIR'] = runtimeDir;
		cleanup.push(() => fs.rmSync(runtimeDir, {recursive: true, force: true}));
		return runtimeDir;
	}

	it('starts and reports running status', async () => {
		useRuntimeDir();
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 99});
		await runtime.start();
		cleanup.push(() => runtime.stop());

		expect(runtime.getStatus()).toBe('running');
		expect(runtime.getLastError()).toBeNull();
	});

	it('conforms to the transport-neutral runtime connector contract', () => {
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime: RuntimeConnector = createClaudeHookRuntime({
			projectDir,
			instanceId: 95,
		});

		expect(typeof runtime.start).toBe('function');
		expect(typeof runtime.stop).toBe('function');
		expect(typeof runtime.getStatus).toBe('function');
		expect(typeof runtime.getLastError).toBe('function');
		expect(typeof runtime.onEvent).toBe('function');
		expect(typeof runtime.onDecision).toBe('function');
		expect(typeof runtime.sendDecision).toBe('function');
		expect(runtime.getStatus()).toBe('stopped');
	});

	it('emits RuntimeEvent when NDJSON arrives on socket', async () => {
		useRuntimeDir();
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 98});
		const events: RuntimeEvent[] = [];
		runtime.onEvent(e => events.push(e));
		await runtime.start();
		cleanup.push(() => runtime.stop());

		const sockPath = resolveHookSocketPath(98);
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

	it('keeps hook IPC independent from hook payload cwd', async () => {
		useRuntimeDir();
		const projectDir = makeTmpDir();
		const worktreeDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));
		cleanup.push(() => fs.rmSync(worktreeDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 198});
		const events: RuntimeEvent[] = [];
		runtime.onEvent(e => events.push(e));
		await runtime.start();
		cleanup.push(() => runtime.stop());

		const client = net.createConnection(resolveHookSocketPath(198));
		await new Promise<void>(resolve => client.on('connect', resolve));
		client.write(
			JSON.stringify({
				request_id: 'worktree-cwd',
				ts: Date.now(),
				session_id: 's-worktree',
				hook_event_name: 'PreToolUse',
				payload: {
					hook_event_name: 'PreToolUse',
					session_id: 's-worktree',
					transcript_path: '/tmp/t.jsonl',
					cwd: worktreeDir,
					tool_name: 'Edit',
					tool_input: {file_path: path.join(projectDir, '.athena/tracker.md')},
					tool_use_id: 'toolu-worktree',
				},
			}) + '\n',
		);

		await new Promise(r => setTimeout(r, 200));
		expect(events).toHaveLength(1);
		expect(events[0]!.id).toBe('worktree-cwd');
		expect(events[0]!.context.cwd).toBe(worktreeDir);

		client.end();
	});

	it('sends HookResultEnvelope back when decision is provided', async () => {
		useRuntimeDir();
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 97});
		const events: RuntimeEvent[] = [];
		runtime.onEvent(e => events.push(e));
		await runtime.start();
		cleanup.push(() => runtime.stop());

		const sockPath = resolveHookSocketPath(97);
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

	it('cleans up stale socket files on start', async () => {
		const runtimeDir = useRuntimeDir();
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		// Create the run directory and plant a stale socket
		const runDir = path.join(runtimeDir, 'run');
		fs.mkdirSync(runDir, {recursive: true});
		const staleSock = path.join(runDir, 'ink-999999999.sock');
		fs.writeFileSync(staleSock, '');

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 77});
		await runtime.start();
		cleanup.push(() => runtime.stop());

		// Stale socket should be gone; only the new one should remain
		const remaining = fs.readdirSync(runDir);
		expect(remaining).toEqual(['ink-77.sock']);
		expect(fs.existsSync(staleSock)).toBe(false);
	});

	it('stops cleanly', async () => {
		useRuntimeDir();
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 96});
		await runtime.start();
		runtime.stop();
		expect(runtime.getStatus()).toBe('stopped');
		expect(runtime.getLastError()).toBeNull();
	});

	it('records a startup error when the socket path is too long', async () => {
		previousRuntimeDir = process.env['ATHENA_RUNTIME_DIR'];
		runtimeDirOverridden = true;
		process.env['ATHENA_RUNTIME_DIR'] = path.join('/tmp', 'a'.repeat(120));
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 55});
		await runtime.start();

		expect(runtime.getStatus()).toBe('stopped');
		expect(runtime.getLastError()).toEqual({
			code: 'socket_path_too_long',
			message: expect.stringContaining('Socket path is too long'),
		});
	});

	it('can simulate hook server startup failures via env for manual testing', async () => {
		useRuntimeDir();
		process.env['ATHENA_SIMULATE_HOOK_SERVER_FAILURE'] = 'socket_bind_failed';
		const projectDir = makeTmpDir();
		cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

		const runtime = createClaudeHookRuntime({projectDir, instanceId: 56});
		await runtime.start();

		expect(runtime.getStatus()).toBe('stopped');
		expect(runtime.getLastError()).toEqual({
			code: 'socket_bind_failed',
			message: expect.stringContaining('Simulated hook server startup failure'),
		});
	});
});
