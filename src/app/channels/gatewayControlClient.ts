/**
 * App-side facade for opening a ControlClient against the gateway daemon.
 *
 * Owns the small surface that bridges a `RuntimeEndpoint` to a connected
 * `ControlClient`: local UDS vs remote WS transport selection, token
 * loading, and TLS option wiring. App/runtime callers (SessionBridge,
 * `athena gateway` CLI subcommands, etc.) consume the facade rather than
 * reaching into `gateway/transport/*` or `gateway/control/client`
 * directly.
 *
 * NOTE: This facade is for *runtime/app-side* control-plane connections.
 * The future `console` channel adapter lives under
 * `src/gateway/adapters/console/` and must not import app code; its
 * broker-side client belongs alongside the adapter, not here.
 */

import {readFileSync} from 'node:fs';
import {
	connect,
	GatewayProtocolError,
	type ControlClient,
} from '../../gateway/control/client';
import {resolveGatewayPaths, type GatewayPaths} from '../../gateway/paths';
import {
	createWsClientTransport,
	wsClientOptionsForEndpoint,
} from '../../gateway/transport/wsClient';
import type {RuntimeEndpoint} from '../../shared/gateway-protocol';

export type ConnectGatewayControlClientOptions = {
	endpoint: RuntimeEndpoint;
	paths: GatewayPaths;
	/** Override token loader for tests. Defaults to reading from disk. */
	loadToken?: (tokenPath: string) => string;
};

export async function connectGatewayControlClient(
	opts: ConnectGatewayControlClientOptions,
): Promise<ControlClient> {
	const loadToken = opts.loadToken ?? defaultLoadToken;
	if (opts.endpoint.mode === 'remote') {
		return connect({
			socketPath: opts.paths.socketPath,
			token: opts.endpoint.token,
			transport: createWsClientTransport(
				wsClientOptionsForEndpoint({
					url: opts.endpoint.url,
					tlsCaPath: opts.endpoint.tlsCaPath,
				}),
			),
		});
	}
	return connect({
		socketPath: opts.paths.socketPath,
		token: loadToken(opts.paths.tokenPath),
	});
}

function defaultLoadToken(tokenPath: string): string {
	return readFileSync(tokenPath, 'utf8').trim();
}

export {resolveGatewayPaths, GatewayProtocolError};
export type {ControlClient, GatewayPaths};
