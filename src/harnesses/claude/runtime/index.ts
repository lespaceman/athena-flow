/**
 * Claude Hook Runtime Adapter.
 *
 * Factory that creates a Runtime instance backed by UDS + NDJSON protocol.
 */

import type {Runtime} from '../../../runtime/types';
import {createServer} from './server';

export type ClaudeHookRuntimeOptions = {
	projectDir: string;
	instanceId: number;
};

export function createClaudeHookRuntime(
	opts: ClaudeHookRuntimeOptions,
): Runtime {
	return createServer(opts);
}
