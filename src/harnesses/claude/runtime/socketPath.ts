import os from 'node:os';
import path from 'node:path';

export const ATHENA_HOOK_SOCKET_ENV = 'ATHENA_HOOK_SOCKET';

const MAX_UNIX_SOCKET_PATH_BYTES = {
	darwin: 103,
	default: 107,
} as const;

function getUid(): string {
	if (typeof process.getuid === 'function') {
		return String(process.getuid());
	}
	return os.userInfo().username;
}

function getSocketPathLimit(): number {
	return process.platform === 'darwin'
		? MAX_UNIX_SOCKET_PATH_BYTES.darwin
		: MAX_UNIX_SOCKET_PATH_BYTES.default;
}

function resolveAthenaRuntimeDir(): string {
	const explicit = process.env['ATHENA_RUNTIME_DIR'];
	if (explicit) return explicit;

	const xdgRuntimeDir = process.env['XDG_RUNTIME_DIR'];
	if (xdgRuntimeDir) return path.join(xdgRuntimeDir, 'athena');

	return path.join('/tmp', `athena-${getUid()}`);
}

export function resolveHookSocketPath(instanceId: number | string): string {
	return path.join(resolveAthenaRuntimeDir(), 'run', `ink-${instanceId}.sock`);
}

export function isSocketPathTooLong(socketPath: string): boolean {
	return Buffer.byteLength(socketPath) > getSocketPathLimit();
}
