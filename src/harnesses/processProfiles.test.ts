import {describe, it, expect} from 'vitest';
import {resolveHarnessProcessProfile} from './processProfiles';
import {createTokenAccumulator} from './claude/process/tokenAccumulator';

describe('resolveHarnessProcessProfile', () => {
	it('resolves claude process profile for claude-code', () => {
		const profile = resolveHarnessProcessProfile('claude-code');
		expect(typeof profile.useProcess).toBe('function');
		expect(profile.tokenParserFactory).toBe(createTokenAccumulator);
	});

	it('uses backward-compatible claude fallback profile for unsupported harnesses', () => {
		const claudeProfile = resolveHarnessProcessProfile('claude-code');
		const codexProfile = resolveHarnessProcessProfile('openai-codex');
		const opencodeProfile = resolveHarnessProcessProfile('opencode');
		expect(codexProfile.useProcess).toBe(claudeProfile.useProcess);
		expect(opencodeProfile.useProcess).toBe(claudeProfile.useProcess);
		expect(codexProfile.tokenParserFactory).toBe(createTokenAccumulator);
		expect(opencodeProfile.tokenParserFactory).toBe(createTokenAccumulator);
	});
});
