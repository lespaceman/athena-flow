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
	createBlockResult,
	createPreToolUseAllowResult,
	createPreToolUseDenyResult,
	createPermissionRequestAllowResult,
} from '../types/hooks/index.js';
import {isPermissionRequired} from '../services/permissionPolicy.js';
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

/** Handle SubagentStop: add as first-class event and parse transcript. */
export function handleSubagentStop(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): boolean {
	const {envelope, displayEvent} = ctx;
	if (!isSubagentStopEvent(envelope.payload)) return false;

	cb.storeWithAutoPassthrough(ctx);
	cb.addEvent(displayEvent);

	const transcriptPath = envelope.payload.agent_transcript_path;
	if (transcriptPath) {
		parseTranscriptFile(transcriptPath, cb.signal)
			.then(summary => cb.onTranscriptParsed(displayEvent.id, summary))
			.catch(err => {
				console.error('[SubagentStop] Failed to parse transcript:', err);
			});
	}

	return true;
}

/** Auto-allow PermissionRequest events (deny rules still apply). */
export function handlePermissionRequest(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): boolean {
	const {envelope} = ctx;
	if (envelope.hook_event_name !== 'PermissionRequest') return false;
	if (!isToolEvent(envelope.payload)) return false;

	// Deny rules still take effect at the PermissionRequest stage
	const matchedRule = matchRule(cb.getRules(), envelope.payload.tool_name);
	if (matchedRule?.action === 'deny') {
		cb.storeWithoutPassthrough(ctx);
		cb.addEvent(ctx.displayEvent);
		cb.respond(
			envelope.request_id,
			createBlockResult(`Blocked by rule: ${matchedRule.addedBy}`),
		);
		return true;
	}

	// Auto-allow everything else — don't addEvent() since PermissionRequest
	// duplicates the PreToolUse event that follows and would create UI noise.
	cb.storeWithoutPassthrough(ctx);
	cb.respond(envelope.request_id, createPermissionRequestAllowResult());
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

/** Apply matching rules to PreToolUse events. */
export function handlePreToolUseRules(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): boolean {
	const {envelope} = ctx;
	if (
		envelope.hook_event_name !== 'PreToolUse' ||
		!isToolEvent(envelope.payload)
	) {
		return false;
	}

	const matchedRule = matchRule(cb.getRules(), envelope.payload.tool_name);
	if (!matchedRule) return false;

	const result =
		matchedRule.action === 'deny'
			? createPreToolUseDenyResult(`Blocked by rule: ${matchedRule.addedBy}`)
			: createPreToolUseAllowResult();

	// Store briefly so respond() can find it, then respond immediately
	cb.storeWithoutPassthrough(ctx);
	cb.addEvent(ctx.displayEvent);
	cb.respond(envelope.request_id, result);
	return true;
}

/**
 * Explicitly allow safe PreToolUse events instead of passthrough.
 *
 * Without this, safe tools (especially READ-tier MCP actions) fall through
 * to the default auto-passthrough handler. A passthrough tells Claude Code
 * "I don't care, decide yourself", which causes Claude to block MCP tools
 * that aren't in its own safe list. By explicitly allowing, we ensure
 * athena's permission policy is authoritative.
 */
export function handleSafeToolAutoAllow(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): boolean {
	const {envelope} = ctx;
	if (
		envelope.hook_event_name !== 'PreToolUse' ||
		!isToolEvent(envelope.payload)
	) {
		return false;
	}

	if (
		isPermissionRequired(
			envelope.payload.tool_name,
			cb.getRules(),
			envelope.payload.tool_input,
		)
	) {
		return false; // Not safe — let handlePermissionCheck deal with it
	}

	// Safe tool: explicitly allow
	cb.storeWithoutPassthrough(ctx);
	cb.addEvent(ctx.displayEvent);
	cb.respond(envelope.request_id, createPreToolUseAllowResult());
	return true;
}

/** Route permission-required PreToolUse events to the permission queue. */
export function handlePermissionCheck(
	ctx: HandlerContext,
	cb: HandlerCallbacks,
): boolean {
	const {envelope} = ctx;
	if (
		envelope.hook_event_name !== 'PreToolUse' ||
		!isToolEvent(envelope.payload) ||
		!isPermissionRequired(
			envelope.payload.tool_name,
			cb.getRules(),
			envelope.payload.tool_input,
		)
	) {
		return false;
	}

	cb.storeWithoutPassthrough(ctx);
	cb.addEvent(ctx.displayEvent);
	cb.enqueuePermission(envelope.request_id);
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
		handleAskUserQuestion(ctx, cb) ||
		handlePreToolUseRules(ctx, cb) ||
		handleSafeToolAutoAllow(ctx, cb) ||
		handlePermissionCheck(ctx, cb);

	if (!handled) {
		// Default: auto-passthrough after timeout
		cb.storeWithAutoPassthrough(ctx);
		cb.addEvent(ctx.displayEvent);
	}

	// Session-specific tracking (runs regardless of handler)
	handleSessionTracking(ctx, cb);
}
