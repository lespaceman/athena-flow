/**
 * Disk persistence for input history.
 *
 * Stores input history as a JSON array in {projectDir}/.claude/input-history.json.
 * All errors are silently swallowed (same pattern as hookLogger.ts).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const HISTORY_FILENAME = 'input-history.json';

/** Load input history from disk. Returns [] on any error. */
export function loadHistory(projectDir: string): string[] {
	const filePath = path.join(projectDir, '.claude', HISTORY_FILENAME);

	try {
		const raw = fs.readFileSync(filePath, 'utf-8');
		const parsed: unknown = JSON.parse(raw);

		if (!Array.isArray(parsed)) return [];

		return parsed.filter((item): item is string => typeof item === 'string');
	} catch {
		return [];
	}
}

/** Save input history to disk via atomic write (tmp + rename). */
export async function saveHistory(
	projectDir: string,
	history: string[],
): Promise<void> {
	const dir = path.join(projectDir, '.claude');
	const filePath = path.join(dir, HISTORY_FILENAME);
	const tmpPath = filePath + '.tmp';

	try {
		await fs.promises.mkdir(dir, {recursive: true});
		await fs.promises.writeFile(tmpPath, JSON.stringify(history) + '\n');
		await fs.promises.rename(tmpPath, filePath);
	} catch {
		// Silent — errors are non-critical for a history file
	}
}
