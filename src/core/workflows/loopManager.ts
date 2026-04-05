/**
 * Loop manager — read-only tracker checker for fresh-session workflow loops.
 *
 * Athena spawns fresh `claude -p` sessions in a loop. Claude owns the tracker
 * file (creates/updates it). Athena only reads the tracker between sessions to
 * check for completion or blocked markers.
 *
 * Iteration count is tracked in-memory (not persisted in the tracker file).
 */

import fs from 'node:fs';
import type {LoopConfig} from './types';

export const DEFAULT_COMPLETION_MARKER = '<!-- WORKFLOW_COMPLETE -->';
export const DEFAULT_BLOCKED_MARKER = '<!-- WORKFLOW_BLOCKED';
export const DEFAULT_TRACKER_PATH = '.athena/{sessionId}/tracker.md';

const DEFAULT_CONTINUE_PROMPT =
	'Continue the task. Read the tracker at {trackerPath} for current progress.';

export type LoopState = {
	active: boolean;
	iteration: number;
	maxIterations: number;
	completionMarker: string;
	blockedMarker: string;
	completed: boolean;
	blocked: boolean;
	blockedReason?: string;
	reachedLimit: boolean;
};

export type LoopManager = {
	/** Read tracker file and return current loop state. */
	getState(): LoopState;
	/** Increment in-memory iteration counter. */
	incrementIteration(): void;
	/** Mark loop as inactive (in memory). */
	deactivate(): void;
	/** Absolute path to the tracker file. */
	readonly trackerPath: string;
};

export function createLoopManager(
	trackerPath: string,
	config: LoopConfig,
): LoopManager {
	let iteration = 0;
	let active = true;

	const completionMarker = config.completionMarker ?? DEFAULT_COMPLETION_MARKER;
	const blockedMarker = config.blockedMarker ?? DEFAULT_BLOCKED_MARKER;

	function readTracker(): string {
		try {
			return fs.readFileSync(trackerPath, 'utf-8');
		} catch {
			return '';
		}
	}

	function extractBlockedReason(content: string): string | undefined {
		const idx = content.indexOf(blockedMarker);
		if (idx === -1) return undefined;
		const afterMarker = content.slice(idx + blockedMarker.length);
		const match = afterMarker.match(/^:\s*(.+?)(?:\s*-->|$)/);
		return match?.[1]?.trim();
	}

	function getState(): LoopState {
		const content = readTracker();
		const completed = content.includes(completionMarker);
		const blocked = content.includes(blockedMarker);
		const blockedReason = blocked ? extractBlockedReason(content) : undefined;
		const reachedLimit = iteration >= config.maxIterations;

		return {
			active,
			iteration,
			maxIterations: config.maxIterations,
			completionMarker,
			blockedMarker,
			completed,
			blocked,
			blockedReason,
			reachedLimit,
		};
	}

	function incrementIteration(): void {
		iteration++;
	}

	function deactivate(): void {
		active = false;
	}

	return {
		getState,
		incrementIteration,
		deactivate,
		trackerPath,
	};
}

export function buildContinuePrompt(loop: LoopConfig): string {
	const template = loop.continuePrompt ?? DEFAULT_CONTINUE_PROMPT;
	return template.replace(
		'{trackerPath}',
		loop.trackerPath ?? DEFAULT_TRACKER_PATH,
	);
}
