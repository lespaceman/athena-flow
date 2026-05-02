/**
 * Build `ChannelAdapter` instances from `~/.config/athena/channels/*.json`
 * sidecars by dispatching to the registered `AdapterModule` for the
 * sidecar's name.
 *
 * Unknown channel names are reported as errors but do not abort startup —
 * a single misconfigured sidecar must not block other channels from coming
 * up. The gateway logs each registration outcome for operator diagnosis.
 */

import type {ChannelAdapter} from '../../shared/gateway-protocol';
import type {ChannelSidecar} from '../../infra/config/channels';
import {findAdapterModule} from './registry';

export type InstantiateResult =
	| {ok: true; adapter: ChannelAdapter}
	| {ok: false; reason: string};

export function instantiateAdapter(sidecar: ChannelSidecar): InstantiateResult {
	const module = findAdapterModule(sidecar.name);
	if (!module) {
		return {ok: false, reason: `unknown channel: ${sidecar.name}`};
	}
	const parsed = module.parseConfig({
		options: sidecar.options,
		allowedUserIds: sidecar.allowedUserIds,
	});
	if (!parsed.ok) {
		return {ok: false, reason: `${sidecar.name}: ${parsed.reason}`};
	}
	return {ok: true, adapter: module.create(parsed.config)};
}
