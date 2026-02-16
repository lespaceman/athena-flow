/**
 * Event handler dispatch chain extracted from useHookServer.
 *
 * Each handler is a pure function that takes a HandlerContext and
 * HandlerCallbacks, returning true if it handled the event.
 * The dispatchEvent function runs the chain (first match wins)
 * then always runs session tracking.
 */

import type {HookEventEnvelope} from '../types/hooks/envelope.js';
import type {HookEventDisplay} from '../types/hooks/display.js';
import type {HookResultPayload} from '../types/hooks/result.js';
import type {HookRule} from '../types/rules.js';
import {matchRule} from '../types/rules.js';
import {
	isToolEvent,
	isSubagentStartEvent,
	isSubagentStopEvent,
	createPermissionRequestAllowResult,
	createPermissionRequestDenyResult,
} from '../types/hooks/index.js';
import {parseTranscriptFile} from '../utils/transcriptParser.js';

/** Shared context passed to each handler in the dispatch chain. */
export type HandlerContext = {
	envelope: HookEventEnvelope;
	displayEvent: HookEventDisplay;
	receiveTimestamp: number;
};

/** Callbacks the handlers use to affect state (provided by useHookServer). */
export type HandlerCallbacks = {
	getRules: () => HookRule[];
	storeWithAutoPassthrough: (ctx: HandlerContext) => void;
	storeWithoutPassthrough: (ctx: HandlerContext) => void;
	addEvent: (event: HookEventDisplay) => void;
	respond: (requestId: string, result: HookResultPayload) => void;
	enqueuePermission: (requestId: string) => void;
	enqueueQuestion: (requestId: string) => void;
	setCurrentSessionId: (sessionId: string) => void;
	onTranscriptParsed: (
		eventId: string,
		summary: HookEventDisplay['transcriptSummary'],
	) => void;
	signal?: AbortSignal;
};

/** Handle SubagentStop: header-only lifecycle marker (result comes via PostToolUse(Task)). */
export function handleSubagentStop(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): boolean {
	const {envelope, displayEvent} = ctx;
	if (!isSubagentStopEvent(envelope.payload)) return false;

	cb.storeWithAutoPassthrough(ctx);
	cb.addEvent(displayEvent);
	return true;
}

/**
 * Handle PermissionRequest: Claude Code is asking "should I allow this tool?"
 *
 * Check session rules first (for "always allow"/"always deny" persistence).
 * If no rule matches, enqueue for user permission dialog.
 */
export function handlePermissionRequest(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): boolean {
	const {envelope} = ctx;
	if (envelope.hook_event_name !== 'PermissionRequest') return false;
	if (!isToolEvent(envelope.payload)) return false;

	// All PermissionRequest paths store without passthrough and emit the event
	cb.storeWithoutPassthrough(ctx);
	cb.addEvent(ctx.displayEvent);

	const matchedRule = matchRule(cb.getRules(), envelope.payload.tool_name);

	if (matchedRule?.action === 'deny') {
		cb.respond(
			envelope.request_id,
			createPermissionRequestDenyResult(
				`Blocked by rule: ${matchedRule.addedBy}`,
			),
		);
	} else if (matchedRule?.action === 'approve') {
		cb.respond(envelope.request_id, createPermissionRequestAllowResult());
	} else {
		// No rule matches — show permission dialog to user
		cb.enqueuePermission(envelope.request_id);
	}

	return true;
}

/** Route AskUserQuestion events to the question queue. */
export function handleAskUserQuestion(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): boolean {
	const {envelope} = ctx;
	if (
		envelope.hook_event_name !== 'PreToolUse' ||
		!isToolEvent(envelope.payload) ||
		envelope.payload.tool_name !== 'AskUserQuestion'
	) {
		return false;
	}

	cb.storeWithoutPassthrough(ctx);
	cb.addEvent(ctx.displayEvent);
	cb.enqueueQuestion(envelope.request_id);
	return true;
}

/** Capture session ID and enrich SessionEnd with transcript data. */
export function handleSessionTracking(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): void {
	const {envelope, displayEvent} = ctx;

	if (envelope.hook_event_name === 'SessionStart') {
		cb.setCurrentSessionId(envelope.session_id);
	}

	if (envelope.hook_event_name !== 'SessionEnd') return;

	const transcriptPath = envelope.payload.transcript_path;
	if (transcriptPath) {
		parseTranscriptFile(transcriptPath, cb.signal)
			.then(summary => cb.onTranscriptParsed(displayEvent.id, summary))
			.catch(err => {
				console.error('[SessionEnd] Failed to parse transcript:', err);
			});
	} else {
		cb.onTranscriptParsed(displayEvent.id, {
			lastAssistantText: null,
			lastAssistantTimestamp: null,
			messageCount: 0,
			toolCallCount: 0,
			error: 'No transcript path provided',
		});
	}
}

/** Track active subagents and tag child events. Returns the updated stack. */
export function tagSubagentEvents(
	envelope: HookEventEnvelope,
	displayEvent: HookEventDisplay,
	activeSubagentStack: string[],
): string[] {
	if (isSubagentStartEvent(envelope.payload)) {
		return [...activeSubagentStack, envelope.payload.agent_id];
	}
	if (isSubagentStopEvent(envelope.payload)) {
		const agentId = envelope.payload.agent_id;
		return activeSubagentStack.filter(id => id !== agentId);
	}
	if (activeSubagentStack.length > 0) {
		displayEvent.parentSubagentId =
			activeSubagentStack[activeSubagentStack.length - 1];
	}
	return activeSubagentStack;
}

/** Run the full dispatch chain: first match wins, then session tracking. */
export function dispatchEvent(ctx: HandlerContext, cb: HandlerCallbacks): void {
	const handled =
		handleSubagentStop(ctx, cb) ||
		handlePermissionRequest(ctx, cb) ||
		handleAskUserQuestion(ctx, cb);

	if (!handled) {
		// Default: auto-passthrough after timeout (all PreToolUse events except
		// AskUserQuestion fall here — permission is handled by Claude Code via
		// PermissionRequest, not PreToolUse)
		cb.storeWithAutoPassthrough(ctx);
		cb.addEvent(ctx.displayEvent);
	}

	// Session-specific tracking (runs regardless of handler)
	handleSessionTracking(ctx, cb);
}
