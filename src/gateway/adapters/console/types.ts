/**
 * Internal configuration for the console adapter.
 *
 * `parseConfig` produces this shape from sidecar JSON; `ConsoleAdapter`
 * consumes it. `brokerClientFactory` is a test seam — production code goes
 * through the default factory in `client.ts`.
 */

import type {ConsoleBrokerClient, PairingTokenProvider} from './client';

export type ConsoleAdapterOptions = {
	/** WSS endpoint for the broker adapter socket. */
	brokerUrl: string;
	/** Broker-visible runner identity for this paired CLI. */
	runnerId: string;
	/** Optional workspace/org/account id surfaced to the broker. */
	workspaceId?: string;
	/** Inline token (tests + local dev). Production uses `tokenPath`. */
	pairingToken?: string;
	/** Filesystem path to the pairing token. Read at start time. */
	tokenPath?: string;
	/**
	 * When true, the adapter mints a short-lived access token before each
	 * broker connect by calling the dashboard refresh endpoint. Mutually
	 * exclusive with `pairingToken` and `tokenPath`. Requires `~/.config/
	 * athena/dashboard.json` (set by `athena dashboard pair`).
	 */
	dashboardConfig?: boolean;
	/** Optional CA bundle for self-signed broker TLS. */
	tlsCaPath?: string;
	/** Override broker-client factory for tests. */
	brokerClientFactory?: ConsoleBrokerClientFactory;
	/** Override pairing-token provider for dashboard mode (tests). */
	pairingTokenProvider?: PairingTokenProvider;
};

export type ConsoleBrokerClientFactory = (input: {
	brokerUrl: string;
	pairingToken?: string;
	pairingTokenProvider?: PairingTokenProvider;
	tlsCaPath?: string;
	log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void;
}) => ConsoleBrokerClient;
