/**
 * Production wiring shim — constructs a `RunnerTransport` backed by an
 * `InstanceSocketClient`. Lives in `app/` because it bridges the app-layer
 * dashboard transport into the gateway-layer adapter contract; gateway code
 * cannot reach into `app/` directly (see eslint layer rules).
 *
 * See ADR 0001 phase 6.
 */

import {
	createInstanceSocketRunnerTransport,
	type InstanceSocketRunnerTransportLog,
	type RunnerWireFrame,
	type RunnerWireSource,
} from '../../gateway/adapters/runner/instanceSocketTransport';
import type {RunnerTransport} from '../../gateway/adapters/runner/types';
import type {InstanceSocketClient} from './instanceSocketClient';

export type RunnerTransportFromInstanceSocketOptions = {
	client: InstanceSocketClient;
	log?: InstanceSocketRunnerTransportLog;
};

export function runnerTransportFromInstanceSocket(
	opts: RunnerTransportFromInstanceSocketOptions,
): RunnerTransport {
	const source: RunnerWireSource = {
		onFrame(handler) {
			opts.client.onFrame(frame => handler(frame as RunnerWireFrame));
		},
		onClose(handler) {
			opts.client.onClose(handler);
		},
		sendRunEvent(event) {
			opts.client.sendRunEvent(event);
		},
	};
	return createInstanceSocketRunnerTransport({
		source,
		...(opts.log ? {log: opts.log} : {}),
	});
}
