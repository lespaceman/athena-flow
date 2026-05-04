import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectGatewayControlClient} from './gatewayControlClient';
import {startDaemon, type DaemonHandle} from '../../gateway/daemon';
import type {GatewayPaths} from '../../gateway/paths';

function tmpPaths(): GatewayPaths {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-gw-facade-'));
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

describe('connectGatewayControlClient (local UDS)', () => {
	let paths: GatewayPaths;
	let daemon: DaemonHandle | undefined;

	beforeEach(() => {
		paths = tmpPaths();
		daemon = undefined;
	});

	afterEach(async () => {
		if (daemon) await daemon.stop();
		try {
			fs.rmSync(path.dirname(paths.runDir), {recursive: true, force: true});
		} catch {
			// best-effort
		}
	}, 30_000);

	it('uses provided loadToken to authenticate over UDS', async () => {
		daemon = await startDaemon({
			foreground: true,
			silent: true,
			paths,
			skipSignalHandlers: true,
			skipChannelLoad: true,
		});
		const issuedToken = fs.readFileSync(paths.tokenPath, 'utf8').trim();
		const loadToken = vi.fn().mockReturnValue(issuedToken);
		const client = await connectGatewayControlClient({
			endpoint: {mode: 'local'},
			paths,
			loadToken,
		});
		expect(loadToken).toHaveBeenCalledWith(paths.tokenPath);
		client.close();
	}, 15_000);

	it('falls back to reading token from disk when loadToken is omitted', async () => {
		daemon = await startDaemon({
			foreground: true,
			silent: true,
			paths,
			skipSignalHandlers: true,
			skipChannelLoad: true,
		});
		const client = await connectGatewayControlClient({
			endpoint: {mode: 'local'},
			paths,
		});
		client.close();
	}, 15_000);
});
