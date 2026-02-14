/**
 * UI display state types for hook events.
 *
 * These types are used by the Ink UI to render and track hook events.
 */

import {type ClaudeHookEvent, type HookEventName} from './events.js';
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
	/** agent_id of the parent subagent this event belongs to */
	parentSubagentId?: string;
	/**
	 * For SubagentStart events: holds the corresponding SubagentStop event data
	 * when the subagent completes. Used to render the completion response in a
	 * single unified subagent box instead of separate Start/Stop boxes.
	 */
	stopEvent?: HookEventDisplay;
	/**
	 * For PreToolUse/PermissionRequest events: holds the corresponding
	 * PostToolUse or PostToolUseFailure event data when the tool completes.
	 * Used to render tool call and result as a single unified entry.
	 */
	postToolEvent?: HookEventDisplay;
	/**
	 * For SubagentStart events: the description from the parent Task tool call.
	 * Extracted from the Task PreToolUse's tool_input.description.
	 */
	taskDescription?: string;
};
