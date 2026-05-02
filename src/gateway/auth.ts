/**
 * Token loading + constant-time comparison for the gateway control plane.
 *
 * The token file lives at `${configDir}/token` (mode 0600). On daemon start
 * we generate a 32-byte random token if the file is missing; clients in the
 * same user account read the same file. Combined with the socket living in a
 * 0700 directory owned by the user, this gives us:
 *
 *   1. Filesystem ACL: only the owning UID can connect (UDS in 0600 path).
 *   2. Token check: even if the socket leaks, a connect frame with a stale
 *      or absent token is rejected at the protocol layer.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {isLoopbackHost, type GatewayListenSpec} from './paths';

const TOKEN_BYTES = 32;

export function loadOrCreateToken(tokenPath: string): string {
	try {
		const buf = fs.readFileSync(tokenPath);
		const text = buf.toString('utf-8').trim();
		if (text.length >= 16) return text;
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code !== 'ENOENT') throw err;
	}

	fs.mkdirSync(path.dirname(tokenPath), {recursive: true, mode: 0o700});
	const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
	fs.writeFileSync(tokenPath, token + '\n', {mode: 0o600});
	if (process.platform !== 'win32') {
		fs.chmodSync(path.dirname(tokenPath), 0o700);
		fs.chmodSync(tokenPath, 0o600);
	}
	return token;
}

export function timingSafeTokenEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a, 'utf-8');
	const bb = Buffer.from(b, 'utf-8');
	if (ab.length !== bb.length) {
		// Still call timingSafeEqual on equal-length buffers to keep the
		// branch behavior data-independent.
		const filler = Buffer.alloc(Math.max(ab.length, bb.length));
		crypto.timingSafeEqual(filler, filler);
		return false;
	}
	return crypto.timingSafeEqual(ab, bb);
}

export function requireTokenForBind(
	spec: GatewayListenSpec,
	token: string | undefined,
): void {
	if (spec.kind === 'uds' || isLoopbackHost(spec.host)) return;
	if (!token || token.length < 16) {
		throw new Error(
			`gateway: refusing to bind ${spec.host}:${spec.port} without token configured`,
		);
	}
	if (!spec.insecure) {
		throw new Error(
			`gateway: refusing to bind ${spec.host}:${spec.port} without TLS; pass --insecure only for trusted tunnels`,
		);
	}
}
