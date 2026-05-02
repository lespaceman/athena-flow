/**
 * GatewayDaemon — long-running process that owns channel adapters, brokers
 * cloud function invocations, and dispatches inbound chats to a registered
 * Athena interactive runtime over a UDS NDJSON control plane.
 *
 * M3 wires lock acquisition, token loading, and the control-plane server.
 * Adapters / invoker / outbox land in M4+.
 */

import fs from 'node:fs';
import {loadOrCreateToken} from './auth';
import {createDispatcher} from './control/handlers';
import {startControlServer, type ControlServer} from './control/server';
import {acquireLock, type LockHandle} from './lock';
import {resolveGatewayPaths, type GatewayPaths} from './paths';

export type DaemonOptions = {
	/** When true the daemon stays in foreground (no detach). */
	foreground: boolean;
	/** Suppresses stdout banner; used by integration tests. */
	silent?: boolean;
	/** Override path resolution; tests inject a tmpdir. */
	paths?: GatewayPaths;
	/** Override env (paths resolution); tests use this for XDG isolation. */
	env?: NodeJS.ProcessEnv;
	/** Skip signal handler installation; tests may not want it. */
	skipSignalHandlers?: boolean;
};

export type DaemonHandle = {
	startedAt: number;
	pid: number;
	paths: GatewayPaths;
	stop: () => Promise<void>;
};

/**
 * Start the gateway daemon. M3: acquires the single-instance lock, loads
 * (or creates) the bearer token, starts the UDS control-plane server, and
 * installs SIGINT/SIGTERM handlers. The caller keeps the event loop alive
 * via a long-period `setInterval` in `entry.ts` — `process.stdin` is
 * unreliable when redirected by background launchers/systemd.
 */
export async function startDaemon(opts: DaemonOptions): Promise<DaemonHandle> {
	const startedAt = Date.now();
	const pid = process.pid;
	const paths = opts.paths ?? resolveGatewayPaths(opts.env);

	fs.mkdirSync(paths.runDir, {recursive: true, mode: 0o700});
	fs.mkdirSync(paths.configDir, {recursive: true, mode: 0o700});
	if (process.platform !== 'win32') {
		try {
			fs.chmodSync(paths.runDir, 0o700);
			fs.chmodSync(paths.configDir, 0o700);
		} catch {
			// best-effort
		}
	}

	const lock: LockHandle = acquireLock(paths.lockPath);
	const token = loadOrCreateToken(paths.tokenPath);
	const dispatch = createDispatcher({startedAt});

	let server: ControlServer;
	try {
		server = await startControlServer({
			socketPath: paths.socketPath,
			token,
			startedAt,
			handler: dispatch,
		});
	} catch (err) {
		lock.release();
		throw err;
	}

	if (!opts.silent) {
		// Stdout is the supervisor's first signal that we're alive — single
		// line, no banner art.
		process.stdout.write(
			`athena-gateway: ok pid=${pid} socket=${paths.socketPath}\n`,
		);
	}

	let stopping = false;
	const stop = async (): Promise<void> => {
		if (stopping) return;
		stopping = true;
		try {
			await server.close();
		} finally {
			lock.release();
		}
	};

	if (!opts.skipSignalHandlers) {
		const onSignal = (signal: NodeJS.Signals) => {
			process.stderr.write(`athena-gateway: received ${signal}, stopping\n`);
			void stop().then(() => process.exit(0));
		};
		process.once('SIGINT', onSignal);
		process.once('SIGTERM', onSignal);
	}

	return {startedAt, pid, paths, stop};
}
