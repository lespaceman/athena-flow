/**
 * UI display state types for hook events.
 *
 * These types are used by the Ink UI to render and track hook events.
 */

import {
	type ClaudeHookEvent,
	type HookEventName,
	type PostToolUseEvent,
	type PostToolUseFailureEvent,
	type SubagentStopEvent,
} from './events.js';
import {type HookResultPayload} from './result.js';
import {type ParsedTranscriptSummary} from '../transcript.js';

/**
 * Status of a hook event in the UI.
 */
export type HookEventStatus =
	| 'pending'
	| 'passthrough'
	| 'blocked'
	| 'json_output';

/**
 * UI display state for a hook event.
 */
export type HookEventDisplay = {
	id: string;
	requestId: string;
	timestamp: Date;
	hookName: HookEventName;
	toolName?: string;
	payload: ClaudeHookEvent;
	status: HookEventStatus;
	result?: HookResultPayload;
	transcriptSummary?: ParsedTranscriptSummary;
	toolUseId?: string;
	postToolPayload?: PostToolUseEvent | PostToolUseFailureEvent;
	postToolRequestId?: string;
	postToolTimestamp?: Date;
	postToolFailed?: boolean;
	subagentStopPayload?: SubagentStopEvent;
	subagentStopRequestId?: string;
	subagentStopTimestamp?: Date;
};
