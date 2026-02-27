/**
 * Claude Hook Runtime Adapter.
 *
 * Factory that creates a Runtime instance backed by UDS + NDJSON protocol.
 */

import type {RuntimeConnector} from '../../../core/runtime/connector';
import {createServer} from './server';

export type ClaudeHookRuntimeOptions = {
	projectDir: string;
	instanceId: number;
};

export function createClaudeHookRuntime(
	opts: ClaudeHookRuntimeOptions,
): RuntimeConnector {
	return createServer(opts);
}
