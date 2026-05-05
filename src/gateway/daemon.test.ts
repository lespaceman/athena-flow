import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startDaemon} from './daemon';
import type {GatewayPaths} from './paths';
import {connect} from './control/client';
import {createWsClientTransport} from './transport/wsClient';

function tmpPaths(): GatewayPaths {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-gw-test-'));
	const runDir = path.join(tmp, 'run');
	const configDir = path.join(tmp, 'config');
	return {
		runDir,
		configDir,
		socketPath: path.join(runDir, 'gw.sock'),
		lockPath: path.join(runDir, 'gw.lock'),
		tokenPath: path.join(configDir, 'token'),
		statePath: path.join(configDir, 'state.db'),
	};
}

describe('startDaemon', () => {
	let paths: GatewayPaths;
	beforeEach(() => {
		paths = tmpPaths();
	});
	afterEach(() => {
		try {
			fs.rmSync(path.dirname(paths.runDir), {recursive: true, force: true});
		} catch {
			// best-effort
		}
	});

	it('returns a handle with pid and startedAt', async () => {
		const handle = await startDaemon({
			foreground: true,
			silent: true,
			paths,
			skipSignalHandlers: true,
			skipChannelLoad: true,
		});
		expect(handle.pid).toBe(process.pid);
		expect(handle.startedAt).toBeLessThanOrEqual(Date.now());
		expect(handle.paths.socketPath).toBe(paths.socketPath);
		await handle.stop();
	});

	it('stop() is idempotent', async () => {
		const handle = await startDaemon({
			foreground: true,
			silent: true,
			paths,
			skipSignalHandlers: true,
			skipChannelLoad: true,
		});
		await handle.stop();
		await expect(handle.stop()).resolves.toBeUndefined();
	});

	it('creates socket, lock, and token on disk', async () => {
		const handle = await startDaemon({
			foreground: true,
			silent: true,
			paths,
			skipSignalHandlers: true,
			skipChannelLoad: true,
		});
		expect(fs.existsSync(paths.socketPath)).toBe(true);
		expect(fs.existsSync(paths.lockPath)).toBe(true);
		expect(fs.existsSync(paths.tokenPath)).toBe(true);
		const tokenText = fs.readFileSync(paths.tokenPath, 'utf-8').trim();
		expect(tokenText.length).toBeGreaterThanOrEqual(16);
		await handle.stop();
		// Lock removed on release.
		expect(fs.existsSync(paths.lockPath)).toBe(false);
	});

	it('rejects a second start while the first is alive', async () => {
		const first = await startDaemon({
			foreground: true,
			silent: true,
			paths,
			skipSignalHandlers: true,
			skipChannelLoad: true,
		});
		await expect(
			startDaemon({
				foreground: true,
				silent: true,
				paths,
				skipSignalHandlers: true,
				skipChannelLoad: true,
			}),
		).rejects.toMatchObject({name: 'GatewayAlreadyRunningError'});
		await first.stop();
	});

	it('serves control traffic over loopback WS when bind is configured', async () => {
		const handle = await startDaemon({
			foreground: true,
			silent: true,
			paths,
			skipSignalHandlers: true,
			skipChannelLoad: true,
			listenSpec: {
				kind: 'tcp',
				host: '127.0.0.1',
				port: 0,
				insecure: false,
			},
		});
		const token = fs.readFileSync(paths.tokenPath, 'utf-8').trim();
		const client = await connect({
			socketPath: paths.socketPath,
			token,
			transport: createWsClientTransport({url: handle.listener.url!}),
		});
		const res = await client.request<Record<string, never>, {pong: boolean}>(
			'ping',
			{},
		);

		expect(res.pong).toBe(true);
		client.close();
		await handle.stop();
	});

	it('reloads channel sidecars through the control plane', async () => {
		const home = path.join(path.dirname(paths.runDir), 'home');
		const channelDir = path.join(home, '.config', 'athena', 'channels');
		fs.mkdirSync(channelDir, {recursive: true, mode: 0o700});
		const sidecarPath = path.join(channelDir, 'unknown.json');
		fs.writeFileSync(sidecarPath, JSON.stringify({enabled: true}), {
			mode: 0o600,
		});
		const handle = await startDaemon({
			foreground: true,
			silent: true,
			paths,
			env: {HOME: home},
			skipSignalHandlers: true,
			skipChannelLoad: true,
		});
		const token = fs.readFileSync(paths.tokenPath, 'utf-8').trim();
		const client = await connect({socketPath: paths.socketPath, token});

		const res = await client.request<
			Record<string, never>,
			{
				results: Array<{
					id: string;
					ok: boolean;
					action: string;
					reason?: string;
				}>;
			}
		>('channels.reload', {});

		expect(res.results).toEqual([
			{
				id: 'unknown',
				ok: false,
				action: 'failed',
				reason: 'unknown channel: unknown',
			},
		]);
		client.close();
		await handle.stop();
	});
});
