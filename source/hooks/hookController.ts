/**
 * Hook controller — UI-decision logic for runtime events.
 *
 * Receives RuntimeEvents and returns ControllerResults with semantic
 * RuntimeDecisions. No transport/protocol imports.
 *
 * Evolves from eventHandlers.ts but operates on RuntimeEvent instead of
 * HandlerContext, and returns decisions instead of calling respond().
 */

import type {RuntimeEvent, RuntimeDecision} from '../runtime/types.js';
import {type HookRule, matchRule} from '../types/rules.js';
import {parseTranscriptFile} from '../utils/transcriptParser.js';

export type ControllerCallbacks = {
	getRules: () => HookRule[];
	enqueuePermission: (eventId: string) => void;
	enqueueQuestion: (eventId: string) => void;
	setCurrentSessionId: (sessionId: string) => void;
	onTranscriptParsed: (eventId: string, summary: unknown) => void;
	signal?: AbortSignal;
};

export type ControllerResult =
	| {handled: true; decision?: RuntimeDecision}
	| {handled: false};

export function handleEvent(
	event: RuntimeEvent,
	cb: ControllerCallbacks,
): ControllerResult {
	// ── PermissionRequest: check rules, enqueue if no match ──
	if (event.hookName === 'PermissionRequest' && event.toolName) {
		const rule = matchRule(cb.getRules(), event.toolName);

		if (rule?.action === 'deny') {
			return {
				handled: true,
				decision: {
					type: 'json',
					source: 'rule',
					intent: {
						kind: 'permission_deny',
						reason: `Blocked by rule: ${rule.addedBy}`,
					},
				},
			};
		}

		if (rule?.action === 'approve') {
			return {
				handled: true,
				decision: {
					type: 'json',
					source: 'rule',
					intent: {kind: 'permission_allow'},
				},
			};
		}

		// No rule — enqueue for user dialog
		cb.enqueuePermission(event.id);
		return {handled: true};
	}

	// ── AskUserQuestion hijack ──
	if (event.hookName === 'PreToolUse' && event.toolName === 'AskUserQuestion') {
		cb.enqueueQuestion(event.id);
		return {handled: true};
	}

	// ── Session tracking (side effects) ──
	if (event.hookName === 'SessionStart') {
		cb.setCurrentSessionId(event.sessionId);
	}

	if (event.hookName === 'SessionEnd') {
		const transcriptPath = event.context.transcriptPath;
		if (transcriptPath) {
			parseTranscriptFile(transcriptPath, cb.signal)
				.then(summary => cb.onTranscriptParsed(event.id, summary))
				.catch(err => {
					console.error('[SessionEnd] Failed to parse transcript:', err);
				});
		} else {
			cb.onTranscriptParsed(event.id, {
				lastAssistantText: null,
				lastAssistantTimestamp: null,
				messageCount: 0,
				toolCallCount: 0,
				error: 'No transcript path provided',
			});
		}
	}

	// Default: not handled — adapter timeout will auto-passthrough
	return {handled: false};
}
