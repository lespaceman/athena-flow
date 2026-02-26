/**
 * Claude Hook Runtime Adapter.
 *
 * Factory that creates a Runtime instance backed by UDS + NDJSON protocol.
 */

import type {Runtime} from '../../types.js';
import {createServer} from './server.js';

export type ClaudeHookRuntimeOptions = {
	projectDir: string;
	instanceId: number;
};

export function createClaudeHookRuntime(
	opts: ClaudeHookRuntimeOptions,
): Runtime {
	return createServer(opts);
}
