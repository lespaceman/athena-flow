import {describe, it, expect, vi} from 'vitest';
import {detectClaudeVersion} from './detectVersion';

vi.mock('node:child_process', () => ({
	execFileSync: vi.fn(),
}));

import {execFileSync} from 'node:child_process';
const mockExecFileSync = vi.mocked(execFileSync);

describe('detectClaudeVersion', () => {
	it('parses version from claude --version output, returns null on failure', () => {
		// Successful parse — standard format "2.1.38 (Claude Code)"
		mockExecFileSync.mockReturnValue('2.1.38 (Claude Code)\n');
		expect(detectClaudeVersion()).toBe('2.1.38');

		// ENOENT — claude binary not found
		mockExecFileSync.mockImplementation(() => {
			const err = new Error('spawnSync claude ENOENT') as NodeJS.ErrnoException;
			err.code = 'ENOENT';
			throw err;
		});
		expect(detectClaudeVersion()).toBeNull();

		// Unexpected output — no version number
		mockExecFileSync.mockReturnValue('something unexpected');
		expect(detectClaudeVersion()).toBeNull();

		// Version-only output (no suffix)
		mockExecFileSync.mockReturnValue('3.0.1\n');
		expect(detectClaudeVersion()).toBe('3.0.1');
	});
});
