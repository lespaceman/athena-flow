import {describe, it, expect} from 'vitest';
import {detectHarness} from './detectHarness';

describe('detectHarness', () => {
	it('returns "Claude Code" as the default harness label', () => {
		expect(detectHarness()).toBe('Claude Code');
		expect(detectHarness('claude-code')).toBe('Claude Code');
	});

	it('maps configured harness IDs to display labels', () => {
		expect(detectHarness('openai-codex')).toBe('OpenAI Codex');
		expect(detectHarness('opencode')).toBe('OpenCode');
	});
});
