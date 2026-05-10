#!/usr/bin/env node
/**
 * Supervisor daemon entry. Compiled to `dist/supervisor.js` by tsup.
 *
 * Runs an embedded gateway in-process and one harness child per attachment:
 *
 *     supervisor.tsx
 *       ├─ startDaemon({foreground:true, skipSignalHandlers:true})
 *       ├─ createMirrorAttachmentSource()
 *       ├─ createAttachmentSet({ createRunner: spawn drisp --attachment-id … })
 *       └─ runSupervisor({source, set})
 *
 * Children connect to the supervisor's UDS and register their SessionBridge
 * under their `attachmentId` so the channel-manager → DispatchPipeline routing
 * (already wired) delivers each console:<runnerId> adapter's inbound to the
 * matching child.
 *
 * Process model — same shape as `dashboardDaemon.ts`:
 *   - exit 0 on graceful shutdown (SIGTERM/SIGINT)
 *   - exit 1 on fatal startup failure (lock contention, gateway boot failure, …)
 *
 * UI consolidation (tabbed/merged child feeds) is Phase 6; for now child stdio
 * is inherited so failures surface during bring-up.
 */

import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRunnerAdapter} from '../../gateway/adapters/runner/adapter';
import type {RunnerTransport} from '../../gateway/adapters/runner/types';
import {startDaemon, type DaemonHandle} from '../../gateway/daemon';
import {resolveGatewayPaths, resolveListenSpec} from '../../gateway/paths';
import {refreshDashboardAccessToken} from '../../infra/config/dashboardAuth';
import {readDashboardClientConfig} from '../../infra/config/dashboardClient';
import {acquirePidLock} from '../../infra/daemon/pidLock';
import {openDaemonLog} from '../../infra/daemon/logFile';
import {
	createInstanceSocketClient,
	type InstanceSocketClient,
} from '../dashboard/instanceSocketClient';
import {runnerTransportFromInstanceSocket} from '../dashboard/runnerTransport';
import {
	createAttachmentRunner,
	type AttachmentRunner,
	type AttachmentRunnerChild,
	type AttachmentRunnerStopReason,
} from '../supervisor/attachmentRunner';
import {createAttachmentSet} from '../supervisor/attachmentSet';
import {createMirrorAttachmentSource} from '../supervisor/mirrorAttachmentSource';
import {runSupervisor} from '../supervisor/runSupervisor';

type SupervisorPaths = {
	dir: string;
	pidPath: string;
	logPath: string;
};

function supervisorPaths(
	env: NodeJS.ProcessEnv = process.env,
): SupervisorPaths {
	const xdg = env['XDG_STATE_HOME'];
	const home = env['HOME'] ?? os.homedir();
	const base = xdg && xdg.length > 0 ? xdg : path.join(home, '.local', 'state');
	const dir = path.join(base, 'drisp');
	return {
		dir,
		pidPath: path.join(dir, 'supervisor.pid'),
		logPath: path.join(dir, 'supervisor.log'),
	};
}

function ensureSupervisorDir(paths: SupervisorPaths): void {
	fs.mkdirSync(paths.dir, {recursive: true, mode: 0o700});
	if (process.platform !== 'win32') {
		try {
			fs.chmodSync(paths.dir, 0o700);
		} catch {
			// best-effort — surfaces as a permission error later if needed
		}
	}
}

/**
 * Resolves `dist/cli.js` relative to this entry's bundled output. Both
 * entries are emitted as siblings under `dist/` by tsup, so we walk to the
 * directory and re-join `cli.js`.
 */
function resolveCliEntry(): string {
	const here = fileURLToPath(import.meta.url);
	return path.join(path.dirname(here), 'cli.js');
}

export async function runSupervisorEntry(): Promise<number> {
	const sup = supervisorPaths();
	ensureSupervisorDir(sup);
	const writer = openDaemonLog(sup.logPath);
	const log = (level: 'debug' | 'info' | 'warn' | 'error', message: string) =>
		writer.write(level, message);

	let pidLock;
	try {
		pidLock = acquirePidLock(sup.pidPath);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log('error', `supervisor startup: ${message}`);
		writer.close();
		process.stderr.write(`drisp supervisor: ${message}\n`);
		return 1;
	}

	const cliEntry = resolveCliEntry();
	const gatewayPaths = resolveGatewayPaths();
	const listenSpec = resolveListenSpec({paths: gatewayPaths});

	let gateway: DaemonHandle;
	try {
		gateway = await startDaemon({
			foreground: true,
			paths: gatewayPaths,
			listenSpec,
			skipSignalHandlers: true,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log('error', `gateway startup failed: ${message}`);
		pidLock.release();
		writer.close();
		process.stderr.write(
			`drisp supervisor: gateway startup failed: ${message}\n`,
		);
		return 1;
	}
	log(
		'info',
		`supervisor: embedded gateway listening on ${describeListener(gateway)}`,
	);

	// Open the dashboard instance socket if a paired config exists. The runner
	// transport reads inbound `job_assignment`/`cancel` frames from this socket
	// and demultiplexes them to per-attachment RunnerAdapters; the gateway's
	// ChannelManager → DispatchPipeline then routes to the matching child.
	// Without a paired config, the supervisor still spawns children but no
	// runner traffic flows — useful for development.
	const dashboardConfig = readDashboardClientConfig();
	let instanceSocket: InstanceSocketClient | null = null;
	let runnerTransport: RunnerTransport | null = null;
	if (dashboardConfig) {
		try {
			const token = await refreshDashboardAccessToken({});
			instanceSocket = createInstanceSocketClient({
				dashboardUrl: dashboardConfig.dashboardUrl,
				instanceId: token.instanceId,
				accessToken: token.accessToken,
				log,
			});
			await instanceSocket.connect();
			runnerTransport = runnerTransportFromInstanceSocket({
				client: instanceSocket,
				log,
			});
			log(
				'info',
				`supervisor: instance socket connected as ${token.instanceId}`,
			);
		} catch (err) {
			log(
				'warn',
				`supervisor: instance socket unavailable (runs will not flow): ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
			instanceSocket = null;
			runnerTransport = null;
		}
	} else {
		log('info', 'supervisor: no dashboard config; skipping runner transport');
	}

	const source = createMirrorAttachmentSource({log});
	const set = createAttachmentSet({
		createRunner: input => {
			const child = createAttachmentRunner({
				attachmentId: input.attachmentId,
				runnerId: input.runnerId,
				spawnChild: args => {
					const proc = spawn(process.execPath, [cliEntry, ...args], {
						stdio: 'inherit',
					});
					return proc as AttachmentRunnerChild;
				},
			});
			if (!runnerTransport) return child;
			return wrapWithRunnerAdapter({
				child,
				attachmentId: input.attachmentId,
				runnerId: input.runnerId,
				transport: runnerTransport,
				gateway,
				log,
			});
		},
	});

	const handle = await runSupervisor({source, set, log});
	log('info', 'supervisor: ready');

	const stopSignal = createDeferred<string>();
	let stopReason = 'sigterm';
	const onSignal = (signal: NodeJS.Signals): void => {
		log('info', `received ${signal}`);
		stopReason = signal;
		stopSignal.resolve(signal);
	};
	process.on('SIGINT', onSignal);
	process.on('SIGTERM', onSignal);

	const reason = await stopSignal.promise;
	process.off('SIGINT', onSignal);
	process.off('SIGTERM', onSignal);
	log('info', `supervisor stopping: ${reason}`);

	// Stop children first so they unregister cleanly before the gateway dies.
	try {
		await handle.shutdown();
	} catch (err) {
		log(
			'warn',
			`supervisor shutdown failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	source.close();
	if (instanceSocket) {
		try {
			instanceSocket.close('supervisor stopping');
		} catch (err) {
			log(
				'warn',
				`instance socket close failed: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
	}
	try {
		await gateway.stop();
	} catch (err) {
		log(
			'warn',
			`gateway stop failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	pidLock.release();
	log('info', `supervisor stopped: ${stopReason}`);
	writer.close();
	return 0;
}

type WrapWithRunnerAdapterOptions = {
	child: AttachmentRunner;
	attachmentId: string;
	runnerId: string;
	transport: RunnerTransport;
	gateway: DaemonHandle;
	log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void;
};

/**
 * Composes an `AttachmentRunner` with adapter registration so the lifecycle
 * is driven by a single start/stop pair: register the RunnerAdapter before
 * the child spawns (so inbound is wired before the child's SessionBridge
 * connects), unregister after the child stops.
 */
function wrapWithRunnerAdapter(
	opts: WrapWithRunnerAdapterOptions,
): AttachmentRunner {
	const adapter = createRunnerAdapter({
		runnerId: opts.runnerId,
		transport: opts.transport,
	});
	let registered = false;
	return {
		attachmentId: opts.child.attachmentId,
		runnerId: opts.child.runnerId,
		async start() {
			if (!registered) {
				try {
					await opts.gateway.channelManager.register(adapter, {
						attachmentId: opts.attachmentId,
					});
					registered = true;
				} catch (err) {
					opts.log(
						'warn',
						`supervisor: failed to register runner adapter for ${opts.attachmentId}: ${
							err instanceof Error ? err.message : String(err)
						}`,
					);
				}
			}
			await opts.child.start();
		},
		async stop(reason: AttachmentRunnerStopReason) {
			await opts.child.stop(reason);
			if (registered) {
				try {
					await opts.gateway.channelManager.unregister(adapter.id, 'shutdown');
				} catch (err) {
					opts.log(
						'warn',
						`supervisor: failed to unregister runner adapter for ${opts.attachmentId}: ${
							err instanceof Error ? err.message : String(err)
						}`,
					);
				}
				registered = false;
			}
		},
		onChildExit: opts.child.onChildExit,
	};
}

function describeListener(gateway: DaemonHandle): string {
	const l = gateway.listener;
	if (l.kind === 'uds') return l.socketPath ?? '<uds>';
	return l.url ?? `${l.host ?? '?'}:${l.port ?? '?'}`;
}

type Deferred<T> = {
	promise: Promise<T>;
	resolve(value: T): void;
};

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(r => {
		resolve = r;
	});
	let settled = false;
	return {
		promise,
		resolve(value: T) {
			if (settled) return;
			settled = true;
			resolve(value);
		},
	};
}

// Bundled entry only. Run on import so `node dist/supervisor.js` works.
void runSupervisorEntry().then(code => {
	process.exit(code);
});
