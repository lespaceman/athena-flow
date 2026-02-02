/**
 * Hook server types.
 *
 * Types for the hook server that receives events from hook-forwarder.
 */

import * as net from 'node:net';
import {type HookEventDisplay} from './hooks/display.js';
import {type HookResultPayload} from './hooks/result.js';
import {type HookRule} from './rules.js';

/**
 * A pending request waiting for a response.
 */
export type PendingRequest = {
	requestId: string;
	socket: net.Socket;
	timeoutId: ReturnType<typeof setTimeout>;
	event: HookEventDisplay;
	/** Timestamp when the event was received, used for logging response time */
	receiveTimestamp: number;
};

/**
 * Result returned by the useHookServer hook.
 */
export type UseHookServerResult = {
	events: HookEventDisplay[];
	isServerRunning: boolean;
	respond: (requestId: string, result: HookResultPayload) => void;
	pendingEvents: HookEventDisplay[];
	socketPath: string | null;
	/** Current session ID captured from SessionStart events */
	currentSessionId: string | null;
	/** Reset the session ID (starts fresh conversation) */
	resetSession: () => void;
	/** Active hook rules for PreToolUse event processing */
	rules: HookRule[];
	/** Add a rule (id is generated automatically) */
	addRule: (rule: Omit<HookRule, 'id'>) => void;
	/** Remove a rule by ID */
	removeRule: (id: string) => void;
	/** Remove all rules */
	clearRules: () => void;
	/** Clear all events */
	clearEvents: () => void;
};
