import {describe, it, expect, afterEach} from 'vitest';
import {detectHarness} from './detectHarness.js';

describe('detectHarness', () => {
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
	});

	it('returns "Claude Code" when CLAUDE_CODE env is set', () => {
		process.env = {...originalEnv, CLAUDE_CODE: '1'};
		expect(detectHarness()).toBe('Claude Code');
	});

	it('returns "Claude Code" when CLAUDE_CODE_ENTRYPOINT is set', () => {
		process.env = {...originalEnv, CLAUDE_CODE_ENTRYPOINT: '/usr/bin/claude'};
		expect(detectHarness()).toBe('Claude Code');
	});

	it('returns "unknown" when no indicators present', () => {
		process.env = {...originalEnv};
		delete process.env['CLAUDE_CODE'];
		delete process.env['CLAUDE_CODE_ENTRYPOINT'];
		expect(detectHarness()).toBe('unknown');
	});
});
