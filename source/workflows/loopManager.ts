/**
 * Loop manager — manages tracker markdown lifecycle for native loop control.
 *
 * Pure utility (not a React hook). Reads/writes a tracker file with YAML
 * frontmatter for iteration state and a markdown body for progress tracking.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {LoopConfig} from './types.js';

const DEFAULT_TEMPLATE = '# Loop Progress\n\n_In progress_';
const DEFAULT_CONTINUE_MESSAGE =
	'Continue working on the task. Check the tracker for remaining items.';

export type LoopState = {
	active: boolean;
	iteration: number;
	maxIterations: number;
	completionMarker: string;
	continueMessage: string;
	trackerContent: string;
};

export type LoopManager = {
	initialize(): void;
	isActive(): boolean;
	getState(): LoopState | null;
	incrementIteration(): void;
	deactivate(): void;
	cleanup(): void;
};

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns {frontmatter, body} or null if no valid frontmatter found.
 */
function parseFrontmatter(
	content: string,
): {frontmatter: Record<string, string>; body: string} | null {
	if (!content.startsWith('---')) return null;
	const endIdx = content.indexOf('\n---', 3);
	if (endIdx === -1) return null;

	const yamlBlock = content.slice(4, endIdx);
	const body = content.slice(endIdx + 4).trimStart();
	const frontmatter: Record<string, string> = {};

	for (const line of yamlBlock.split('\n')) {
		const colonIdx = line.indexOf(':');
		if (colonIdx === -1) continue;
		const key = line.slice(0, colonIdx).trim();
		let value = line.slice(colonIdx + 1).trim();
		// Strip surrounding quotes
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		frontmatter[key] = value;
	}

	return {frontmatter, body};
}

/**
 * Serialize frontmatter + body back to a markdown string.
 */
function serializeFrontmatter(
	frontmatter: Record<string, string>,
	body: string,
): string {
	const lines = Object.entries(frontmatter).map(([k, v]) => {
		// Quote string values that aren't plain numbers/booleans
		if (v === 'true' || v === 'false' || /^\d+$/.test(v)) {
			return `${k}: ${v}`;
		}
		return `${k}: "${v}"`;
	});
	return `---\n${lines.join('\n')}\n---\n${body}`;
}

export function createLoopManager(
	trackerPath: string,
	config: LoopConfig,
): LoopManager {
	const template = config.trackerTemplate ?? DEFAULT_TEMPLATE;
	const continueMessage = config.continueMessage ?? DEFAULT_CONTINUE_MESSAGE;

	function initialize(): void {
		const dir = path.dirname(trackerPath);
		fs.mkdirSync(dir, {recursive: true});

		const frontmatter: Record<string, string> = {
			iteration: '0',
			max_iterations: String(config.maxIterations),
			completion_marker: config.completionMarker,
			active: 'true',
			started_at: new Date().toISOString(),
		};

		fs.writeFileSync(
			trackerPath,
			serializeFrontmatter(frontmatter, template),
			'utf-8',
		);
	}

	function getState(): LoopState | null {
		try {
			if (!fs.existsSync(trackerPath)) return null;
			const content = fs.readFileSync(trackerPath, 'utf-8');
			const parsed = parseFrontmatter(content);
			if (!parsed) return null;

			const {frontmatter, body} = parsed;
			return {
				active: frontmatter['active'] === 'true',
				iteration: parseInt(frontmatter['iteration'] ?? '0', 10),
				maxIterations: parseInt(
					frontmatter['max_iterations'] ?? String(config.maxIterations),
					10,
				),
				completionMarker:
					frontmatter['completion_marker'] ?? config.completionMarker,
				continueMessage,
				trackerContent: body,
			};
		} catch {
			// Fail open — if we can't read, return null so Claude stops
			return null;
		}
	}

	function isActive(): boolean {
		return getState()?.active ?? false;
	}

	function updateFrontmatter(updates: Record<string, string>): void {
		const content = fs.readFileSync(trackerPath, 'utf-8');
		const parsed = parseFrontmatter(content);
		if (!parsed) return;

		const newFrontmatter = {...parsed.frontmatter, ...updates};
		fs.writeFileSync(
			trackerPath,
			serializeFrontmatter(newFrontmatter, parsed.body),
			'utf-8',
		);
	}

	function incrementIteration(): void {
		const state = getState();
		if (!state) return;
		updateFrontmatter({iteration: String(state.iteration + 1)});
	}

	function deactivate(): void {
		updateFrontmatter({active: 'false'});
	}

	function cleanup(): void {
		if (fs.existsSync(trackerPath)) {
			fs.unlinkSync(trackerPath);
		}
	}

	return {
		initialize,
		isActive,
		getState,
		incrementIteration,
		deactivate,
		cleanup,
	};
}
