import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
	connect,
	GatewayUnauthorizedError,
	GatewayUnreachableError,
} from '../../gateway/control/client';
import {resolveGatewayPaths} from '../../gateway/paths';
import type {
	PingResponsePayload,
	StatusResponsePayload,
} from '../../shared/gateway-protocol';

const USAGE = `Usage: athena-flow gateway <subcommand> [--json]

Subcommands:
  start     Run the gateway daemon in foreground (only mode in this build).
  status    Print daemon pid, uptime, and version.
  probe     Send a ping RPC and report reachability + latency.
`;

export type GatewayCommandInput = {
	subcommand: string;
	subcommandArgs: string[];
};

export type GatewayCommandDeps = {
	logOut?: (message: string) => void;
	logError?: (message: string) => void;
	resolveDaemonEntry?: () => string;
	resolveSocketPath?: () => string;
	resolveTokenPath?: () => string;
};

function defaultResolveDaemonEntry(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, 'athena-gateway.js');
}

function readToken(tokenPath: string): string {
	try {
		return fs.readFileSync(tokenPath, 'utf-8').trim();
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === 'ENOENT') {
			throw new Error(
				`gateway token missing at ${tokenPath}. ` +
					`Start the daemon with "athena gateway start" first.`,
			);
		}
		throw err;
	}
}

function flagJson(args: string[]): boolean {
	return args.includes('--json');
}

export async function runGatewayCommand(
	input: GatewayCommandInput,
	deps: GatewayCommandDeps = {},
): Promise<number> {
	const logOut = deps.logOut ?? ((m: string) => process.stdout.write(m + '\n'));
	const logError =
		deps.logError ?? ((m: string) => process.stderr.write(m + '\n'));
	const resolveDaemonEntry =
		deps.resolveDaemonEntry ?? defaultResolveDaemonEntry;
	const resolveSocketPath =
		deps.resolveSocketPath ?? (() => resolveGatewayPaths().socketPath);
	const resolveTokenPath =
		deps.resolveTokenPath ?? (() => resolveGatewayPaths().tokenPath);

	const {subcommand, subcommandArgs} = input;

	if (!subcommand || subcommand === 'help' || subcommand === '--help') {
		logOut(USAGE);
		return 0;
	}

	if (subcommand === 'start') {
		// M1: foreground is the only mode; the spawn indirection here is a
		// stub — M8 will reuse it for `spawn(detached: true)` background mode
		// plus launchd/systemd install. For now it costs an extra Node startup
		// but isolates the daemon's lifecycle from the CLI process.
		void subcommandArgs;
		const entry = resolveDaemonEntry();
		const child = spawn(process.execPath, [entry], {stdio: 'inherit'});
		return await new Promise<number>(resolve => {
			child.once('exit', code => resolve(code ?? 0));
			child.once('error', err => {
				logError(`gateway start: failed to spawn daemon: ${err.message}`);
				resolve(1);
			});
		});
	}

	if (subcommand === 'probe') {
		const json = flagJson(subcommandArgs);
		const socketPath = resolveSocketPath();
		const tokenPath = resolveTokenPath();
		const startedAt = Date.now();
		try {
			const token = readToken(tokenPath);
			const client = await connect({socketPath, token, timeoutMs: 3_000});
			const res = await client.request<
				Record<string, never>,
				PingResponsePayload
			>('ping', {});
			client.close();
			const latencyMs = Date.now() - startedAt;
			if (json) {
				logOut(
					JSON.stringify({
						ok: true,
						reachable: true,
						latency_ms: latencyMs,
						daemon_pid: res.daemonPid,
						daemon_uptime_ms: res.uptimeMs,
					}),
				);
			} else {
				logOut(
					`gateway: reachable pid=${res.daemonPid} uptime=${res.uptimeMs}ms latency=${latencyMs}ms`,
				);
			}
			return 0;
		} catch (err) {
			return reportProbeFailure(err, json, logOut, logError);
		}
	}

	if (subcommand === 'status') {
		const json = flagJson(subcommandArgs);
		const socketPath = resolveSocketPath();
		const tokenPath = resolveTokenPath();
		try {
			const token = readToken(tokenPath);
			const client = await connect({socketPath, token, timeoutMs: 3_000});
			const res = await client.request<
				Record<string, never>,
				StatusResponsePayload
			>('status', {});
			client.close();
			if (json) {
				logOut(JSON.stringify(res));
			} else {
				logOut(
					`gateway: running pid=${res.daemonPid} uptime=${res.uptimeMs}ms version=${res.version}`,
				);
			}
			return 0;
		} catch (err) {
			return reportProbeFailure(err, json, logOut, logError);
		}
	}

	logError(`Unknown gateway subcommand: ${subcommand}`);
	logError(USAGE);
	return 2;
}

function reportProbeFailure(
	err: unknown,
	json: boolean,
	logOut: (m: string) => void,
	logError: (m: string) => void,
): number {
	const message = err instanceof Error ? err.message : String(err);
	if (err instanceof GatewayUnreachableError) {
		if (json) {
			logOut(
				JSON.stringify({
					ok: false,
					reachable: false,
					reason: 'unreachable',
					message,
				}),
			);
		} else {
			logError(`gateway: not reachable — ${message}`);
		}
		return 1;
	}
	if (err instanceof GatewayUnauthorizedError) {
		if (json) {
			logOut(
				JSON.stringify({
					ok: false,
					reachable: true,
					reason: 'unauthorized',
					message,
				}),
			);
		} else {
			logError(`gateway: unauthorized — ${message}`);
		}
		return 1;
	}
	if (json) {
		logOut(JSON.stringify({ok: false, reason: 'error', message}));
	} else {
		logError(`gateway: ${message}`);
	}
	return 1;
}
