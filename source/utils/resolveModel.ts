import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Read the configured model from Claude Code's settings files.
 * Checks project-local, project, user-local, and user settings in priority order.
 */
export function readClaudeSettingsModel(projectDir: string): string | null {
	const home = os.homedir();
	const paths = [
		path.join(projectDir, '.claude', 'settings.local.json'),
		path.join(projectDir, '.claude', 'settings.json'),
		path.join(home, '.claude', 'settings.local.json'),
		path.join(home, '.claude', 'settings.json'),
	];

	for (const p of paths) {
		try {
			const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as {
				model?: string;
			};
			if (raw.model) return raw.model;
		} catch {
			// File doesn't exist or invalid JSON
		}
	}

	return null;
}
