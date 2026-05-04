/**
 * Console `AdapterModule` — sidecar-config parsing + adapter construction.
 *
 * Sidecar JSON keys are snake_case (matching the rest of the channels
 * config surface); `parseConfig` translates to the camelCase
 * `ConsoleAdapterOptions` shape consumed inside the adapter. Validation is
 * intentionally strict so misconfiguration fails on daemon start, not on
 * first runtime turn.
 */

import type {AdapterModule} from '../../../shared/gateway-protocol';
import {ConsoleAdapter} from './adapter';
import type {ConsoleAdapterOptions} from './types';

export const consoleModule: AdapterModule<ConsoleAdapterOptions> = {
	name: 'console',

	parseConfig({options}) {
		const brokerUrl = options['broker_url'];
		if (typeof brokerUrl !== 'string' || brokerUrl.length === 0) {
			return {ok: false, reason: 'broker_url missing'};
		}
		if (!/^wss?:\/\//.test(brokerUrl)) {
			return {ok: false, reason: 'broker_url must start with ws:// or wss://'};
		}
		if (brokerUrl.startsWith('ws://') && !isLoopbackUrl(brokerUrl)) {
			return {
				ok: false,
				reason: 'broker_url must use wss:// for non-loopback hosts',
			};
		}
		const runnerId = options['runner_id'];
		if (typeof runnerId !== 'string' || runnerId.length === 0) {
			return {ok: false, reason: 'runner_id missing'};
		}
		const pairingToken = options['pairing_token'];
		const tokenPath = options['token_path'];
		const dashboardConfig = options['dashboard_config'];
		if (dashboardConfig !== undefined && typeof dashboardConfig !== 'boolean') {
			return {ok: false, reason: 'dashboard_config must be a boolean'};
		}
		const useDashboardConfig = dashboardConfig === true;
		const hasInline =
			typeof pairingToken === 'string' && pairingToken.length > 0;
		const hasTokenPath = typeof tokenPath === 'string' && tokenPath.length > 0;
		if (useDashboardConfig && (hasInline || hasTokenPath)) {
			return {
				ok: false,
				reason:
					'dashboard_config is mutually exclusive with pairing_token and token_path',
			};
		}
		if (!useDashboardConfig && !hasInline && !hasTokenPath) {
			return {
				ok: false,
				reason:
					'either pairing_token, token_path, or dashboard_config is required',
			};
		}
		if (pairingToken !== undefined && typeof pairingToken !== 'string') {
			return {ok: false, reason: 'pairing_token must be a string'};
		}
		if (tokenPath !== undefined && typeof tokenPath !== 'string') {
			return {ok: false, reason: 'token_path must be a string'};
		}
		const workspaceId = options['workspace_id'];
		if (workspaceId !== undefined && typeof workspaceId !== 'string') {
			return {ok: false, reason: 'workspace_id must be a string'};
		}
		const tlsCaPath = options['tls_ca_path'];
		if (tlsCaPath !== undefined && typeof tlsCaPath !== 'string') {
			return {ok: false, reason: 'tls_ca_path must be a string'};
		}

		const config: ConsoleAdapterOptions = {
			brokerUrl,
			runnerId,
			...(workspaceId !== undefined ? {workspaceId} : {}),
			...(useDashboardConfig
				? {dashboardConfig: true}
				: {
						...(pairingToken !== undefined ? {pairingToken} : {}),
						...(tokenPath !== undefined ? {tokenPath} : {}),
					}),
			...(tlsCaPath !== undefined ? {tlsCaPath} : {}),
		};
		return {ok: true, config};
	},

	create(config) {
		return new ConsoleAdapter(config);
	},
};

function isLoopbackUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname;
		return host === 'localhost' || host === '127.0.0.1' || host === '::1';
	} catch {
		return false;
	}
}
