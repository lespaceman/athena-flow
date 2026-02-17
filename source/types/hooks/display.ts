/**
 * UI display state types for hook events.
 *
 * These types are used by the Ink UI to render and track hook events.
 */

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
 *
 * This type is UI-internal. hookName is an open string (forward compatible
 * with unknown event types). payload is unknown (UI renderers may deep-access
 * but must not import protocol types for type narrowing).
 */
export type HookEventDisplay = {
	id: string;
	timestamp: Date;
	hookName: string;
	toolName?: string;
	payload: unknown;
	status: HookEventStatus;
	result?: unknown;
	transcriptSummary?: ParsedTranscriptSummary;
	toolUseId?: string;
	/** agent_id of the parent subagent this event belongs to */
	parentSubagentId?: string;
};
