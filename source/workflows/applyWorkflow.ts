/**
 * Workflow application utilities.
 *
 * Transforms user prompts via workflow templates and manages
 * ralph-loop state files for iterative workflows.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {LoopConfig} from './types.js';

const STATE_FILE = 'ralph-loop.local.md';

/**
 * Replace `{input}` placeholder in a prompt template with the user's input.
 */
export function applyPromptTemplate(template: string, input: string): string {
	return template.replace('{input}', input);
}

/**
 * Write the ralph-loop state file to arm the loop before spawning Claude.
 * No-op if `loop.enabled` is false.
 */
export function writeLoopState(
	projectDir: string,
	prompt: string,
	loop: LoopConfig,
): void {
	if (!loop.enabled) return;

	const claudeDir = path.join(projectDir, '.claude');
	fs.mkdirSync(claudeDir, {recursive: true});

	const content = [
		'---',
		'active: true',
		'iteration: 0',
		`max_iterations: ${loop.maxIterations}`,
		`completion_promise: "${loop.completionPromise}"`,
		`started_at: "${new Date().toISOString()}"`,
		'---',
		prompt,
	].join('\n');

	fs.writeFileSync(path.join(claudeDir, STATE_FILE), content, 'utf-8');
}

/**
 * Remove the ralph-loop state file if it exists.
 * Called on process kill to prevent zombie loops.
 */
export function removeLoopState(projectDir: string): void {
	const statePath = path.join(projectDir, '.claude', STATE_FILE);
	if (fs.existsSync(statePath)) {
		fs.unlinkSync(statePath);
	}
}
