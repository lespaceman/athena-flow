import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Boundary enforcement: UI code must not import from Claude adapter
 * or protocol type modules. This test catches regressions.
 *
 * HookContext.tsx is excluded — it is the bridge between adapter and UI.
 */

const SOURCE_DIR = path.resolve(import.meta.dirname, '../..');

// Files that are allowed to cross the boundary (bridge modules)
const EXCLUDED_FILES = new Set(['HookContext.tsx']);

// UI directories that should NOT import protocol types
const UI_DIRS = ['components', 'context', 'hooks'];

// Forbidden import paths (substrings)
const FORBIDDEN_PATHS = [
	'runtime/adapters/claudeHooks',
	'types/hooks/envelope',
	'types/hooks/result',
	'types/hooks/events',
];

// Forbidden type names (as import specifiers)
const FORBIDDEN_TYPES = [
	'HookEventEnvelope',
	'HookResultEnvelope',
	'HookResultPayload',
	'ClaudeHookEvent',
	'HookAction',
];

function collectFiles(dir: string, ext: string[]): string[] {
	const results: string[] = [];
	if (!fs.existsSync(dir)) return results;
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectFiles(full, ext));
		} else if (ext.some(e => entry.name.endsWith(e))) {
			results.push(full);
		}
	}
	return results;
}

describe('runtime boundary enforcement', () => {
	for (const uiDir of UI_DIRS) {
		const dirPath = path.join(SOURCE_DIR, uiDir);
		const files = collectFiles(dirPath, ['.ts', '.tsx']).filter(
			f => !EXCLUDED_FILES.has(path.basename(f)),
		);

		for (const file of files) {
			const relPath = path.relative(SOURCE_DIR, file);

			it(`${relPath} does not import forbidden protocol paths`, () => {
				const content = fs.readFileSync(file, 'utf-8');
				for (const forbidden of FORBIDDEN_PATHS) {
					expect(content).not.toContain(forbidden);
				}
			});

			it(`${relPath} does not import forbidden protocol types`, () => {
				const content = fs.readFileSync(file, 'utf-8');
				const importLines = content
					.split('\n')
					.filter(line => line.trimStart().startsWith('import'));
				for (const line of importLines) {
					for (const typeName of FORBIDDEN_TYPES) {
						expect(line).not.toContain(typeName);
					}
				}
			});
		}
	}
});
