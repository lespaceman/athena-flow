import {describe, it, expect} from 'vitest';
import {resolveHarnessProcessProfile} from './processProfiles';
import {useClaudeProcess} from './claude/process/useProcess';
import {createTokenAccumulator} from './claude/process/tokenAccumulator';

describe('resolveHarnessProcessProfile', () => {
	it('resolves claude process profile for claude-code', () => {
		const profile = resolveHarnessProcessProfile('claude-code');
		expect(profile.useProcess).toBe(useClaudeProcess);
		expect(profile.tokenParserFactory).toBe(createTokenAccumulator);
	});

	it('uses backward-compatible claude fallback profile for unsupported harnesses', () => {
		const codexProfile = resolveHarnessProcessProfile('openai-codex');
		const opencodeProfile = resolveHarnessProcessProfile('opencode');
		expect(codexProfile.useProcess).toBe(useClaudeProcess);
		expect(opencodeProfile.useProcess).toBe(useClaudeProcess);
		expect(codexProfile.tokenParserFactory).toBe(createTokenAccumulator);
		expect(opencodeProfile.tokenParserFactory).toBe(createTokenAccumulator);
	});
});
