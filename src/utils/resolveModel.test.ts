import {describe, it, expect, vi, beforeEach} from 'vitest';
import fs from 'node:fs';
import {readClaudeSettingsModel} from './resolveModel.js';

vi.mock('node:os', () => ({
	default: {homedir: () => '/home/testuser'},
}));

vi.mock('node:fs', () => ({
	default: {
		readFileSync: vi.fn(),
	},
}));

const mockReadFileSync = vi.mocked(fs.readFileSync);

describe('readClaudeSettingsModel', () => {
	beforeEach(() => {
		mockReadFileSync.mockReset();
	});

	it('checks settings files in priority order and returns first model found', () => {
		// Project local wins over all others
		mockReadFileSync.mockImplementation((p: unknown) => {
			if (String(p).includes('.claude/settings.local.json'))
				return JSON.stringify({model: 'opus'});
			throw new Error('ENOENT');
		});
		expect(readClaudeSettingsModel('/my/project')).toBe('opus');

		// Falls back to project settings when local is missing
		mockReadFileSync.mockImplementation((p: unknown) => {
			const path = String(p);
			if (path === '/my/project/.claude/settings.json')
				return JSON.stringify({model: 'sonnet'});
			throw new Error('ENOENT');
		});
		expect(readClaudeSettingsModel('/my/project')).toBe('sonnet');

		// Falls back to user settings when project settings are missing
		mockReadFileSync.mockImplementation((p: unknown) => {
			const path = String(p);
			if (path === '/home/testuser/.claude/settings.json')
				return JSON.stringify({model: 'claude-opus-4-6'});
			throw new Error('ENOENT');
		});
		expect(readClaudeSettingsModel('/my/project')).toBe('claude-opus-4-6');
	});

	it('returns null when no settings files exist', () => {
		mockReadFileSync.mockImplementation(() => {
			throw new Error('ENOENT');
		});

		expect(readClaudeSettingsModel('/my/project')).toBeNull();
	});

	it('skips files without a model field or with invalid JSON', () => {
		mockReadFileSync.mockImplementation((p: unknown) => {
			const path = String(p);
			if (path === '/my/project/.claude/settings.local.json')
				return JSON.stringify({permissions: {}});
			if (path === '/my/project/.claude/settings.json') return 'not json{{{';
			if (path === '/home/testuser/.claude/settings.json')
				return JSON.stringify({model: 'haiku'});
			throw new Error('ENOENT');
		});

		expect(readClaudeSettingsModel('/my/project')).toBe('haiku');
	});
});
