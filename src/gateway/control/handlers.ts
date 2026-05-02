/**
 * Request dispatcher for gateway control-plane envelopes.
 *
 * M3 implements two request kinds: `ping` and `status`. Channel/relay/
 * function kinds land in M4–M7.
 */

import {createRequire} from 'node:module';
import type {
	ControlEnvelope,
	ControlResponseEnvelope,
	PingResponsePayload,
	StatusResponsePayload,
} from '../../shared/gateway-protocol';

const require = createRequire(import.meta.url);

let cachedVersion: string | null = null;
function readVersion(): string {
	if (cachedVersion !== null) return cachedVersion;
	try {
		const pkg = require('../../../package.json') as {version?: string};
		cachedVersion = pkg.version ?? '0.0.0';
	} catch {
		cachedVersion = '0.0.0';
	}
	return cachedVersion;
}

export type DispatcherDeps = {
	startedAt: number;
};

export function createDispatcher(deps: DispatcherDeps) {
	const handle = async (
		envelope: ControlEnvelope,
	): Promise<ControlResponseEnvelope> => {
		const ts = Date.now();
		switch (envelope.kind) {
			case 'ping': {
				const payload: PingResponsePayload = {
					pong: true,
					daemonPid: process.pid,
					uptimeMs: ts - deps.startedAt,
				};
				return {request_id: envelope.request_id, ts, ok: true, payload};
			}
			case 'status': {
				const payload: StatusResponsePayload = {
					daemonPid: process.pid,
					startedAt: deps.startedAt,
					uptimeMs: ts - deps.startedAt,
					version: readVersion(),
					channels: [], // populated in M4
				};
				return {request_id: envelope.request_id, ts, ok: true, payload};
			}
			default:
				return {
					request_id: envelope.request_id,
					ts,
					ok: false,
					error: {
						code: 'unknown_kind',
						message: `unknown kind: ${envelope.kind}`,
					},
				};
		}
	};
	return handle;
}
