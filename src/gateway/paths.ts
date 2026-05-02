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

	if (Buffer.byteLength(socketPath, 'utf-8') > SUN_PATH_MAX) {
		throw new Error(
			`Gateway socket path exceeds ${SUN_PATH_MAX} bytes (sun_path limit): ${socketPath}. ` +
				`Set XDG_RUNTIME_DIR to a shorter path or relocate $HOME.`,
		);
	}

	return {runDir, configDir, socketPath, lockPath, tokenPath};
}
