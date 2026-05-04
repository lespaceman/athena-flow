/**
 * Filesystem layout for the gateway daemon.
 *
 * Honors `XDG_RUNTIME_DIR` when present (Linux user sessions). Falls back to
 * `~/.config/athena/run/` on macOS and other platforms where it's unset.
 *
 * Validates the resolved socket path against the 108-byte `sun_path` limit
 * common on BSDs/macOS to fail closed early with a clear error.
 */

import os from 'node:os';
import path from 'node:path';

const SUN_PATH_MAX = 104; // safe lower bound; macOS=104, Linux=108, leave headroom

export type GatewayPaths = {
	runDir: string;
	configDir: string;
	socketPath: string;
	lockPath: string;
	tokenPath: string;
	statePath: string;
};

export type GatewayTlsConfig = {
	certPath: string;
	keyPath: string;
};

export type GatewayListenSpec =
	| {kind: 'uds'; socketPath: string}
	| {
			kind: 'tcp';
			host: string;
			port: number;
			insecure: boolean;
			tls?: GatewayTlsConfig;
	  };

export type ResolveListenSpecOptions = {
	paths: GatewayPaths;
	bind?: string;
	insecure?: boolean;
	tls?: GatewayTlsConfig;
};

export function resolveGatewayPaths(
	env: NodeJS.ProcessEnv = process.env,
): GatewayPaths {
	const home = env['HOME'] ?? os.homedir();
	const xdg = env['XDG_RUNTIME_DIR']?.trim();
	const runDir =
		xdg && xdg.length > 0
			? path.join(xdg, 'athena')
			: path.join(home, '.config', 'athena', 'run');
	const configDir = path.join(home, '.config', 'athena', 'gateway');
	const socketPath = path.join(runDir, 'gateway.sock');
	const lockPath = path.join(runDir, 'gateway.lock');
	const tokenPath = path.join(configDir, 'token');
	const statePath = path.join(configDir, 'state.db');

	if (Buffer.byteLength(socketPath, 'utf-8') > SUN_PATH_MAX) {
		throw new Error(
			`Gateway socket path exceeds ${SUN_PATH_MAX} bytes (sun_path limit): ${socketPath}. ` +
				`Set XDG_RUNTIME_DIR to a shorter path or relocate $HOME.`,
		);
	}

	return {runDir, configDir, socketPath, lockPath, tokenPath, statePath};
}

export function resolveListenSpec(
	opts: ResolveListenSpecOptions,
): GatewayListenSpec {
	if (!opts.bind) {
		return {kind: 'uds', socketPath: opts.paths.socketPath};
	}
	const parsed = parseHostPort(opts.bind);
	return {
		kind: 'tcp',
		host: parsed.host,
		port: parsed.port,
		insecure: opts.insecure ?? false,
		...(opts.tls ? {tls: opts.tls} : {}),
	};
}

function parseHostPort(bind: string): {host: string; port: number} {
	const idx = bind.lastIndexOf(':');
	if (idx <= 0 || idx === bind.length - 1) {
		throw new Error(
			`gateway: invalid --bind value ${bind}; expected host:port`,
		);
	}
	const host = bind.slice(0, idx);
	const portText = bind.slice(idx + 1);
	const port = Number(portText);
	if (!Number.isInteger(port) || port < 0 || port > 65535) {
		throw new Error(`gateway: invalid --bind port ${portText}`);
	}
	return {host, port};
}

export function isLoopbackHost(host: string): boolean {
	const normalized = host.toLowerCase();
	return (
		normalized === 'localhost' ||
		normalized === '::1' ||
		normalized === '[::1]' ||
		normalized === '0:0:0:0:0:0:0:1' ||
		normalized.startsWith('127.')
	);
}
