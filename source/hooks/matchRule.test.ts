import {describe, it, expect} from 'vitest';
import {matchRule} from './useHookServer.js';
import {type HookRule} from '../types/rules.js';

function makeRule(
	overrides: Partial<HookRule> & {toolName: string; action: HookRule['action']},
): HookRule {
	return {
		id: `rule-${Math.random()}`,
		addedBy: '/test',
		...overrides,
	};
}

describe('matchRule', () => {
	it('returns undefined when no rules match', () => {
		const rules = [makeRule({toolName: 'Bash', action: 'deny'})];
		expect(matchRule(rules, 'Read')).toBeUndefined();
	});

	it('matches a deny rule by exact tool name', () => {
		const rule = makeRule({toolName: 'Bash', action: 'deny'});
		expect(matchRule([rule], 'Bash')).toBe(rule);
	});

	it('matches an approve rule by exact tool name', () => {
		const rule = makeRule({toolName: 'Read', action: 'approve'});
		expect(matchRule([rule], 'Read')).toBe(rule);
	});

	it('wildcard * matches any tool name', () => {
		const rule = makeRule({toolName: '*', action: 'approve'});
		expect(matchRule([rule], 'Bash')).toBe(rule);
		expect(matchRule([rule], 'Read')).toBe(rule);
	});

	it('deny rules take precedence over approve rules', () => {
		const denyRule = makeRule({toolName: 'Bash', action: 'deny'});
		const approveRule = makeRule({toolName: 'Bash', action: 'approve'});
		// Even if approve is listed first
		expect(matchRule([approveRule, denyRule], 'Bash')).toBe(denyRule);
	});

	it('deny wildcard takes precedence over approve wildcard', () => {
		const approveAll = makeRule({toolName: '*', action: 'approve'});
		const denyAll = makeRule({toolName: '*', action: 'deny'});
		expect(matchRule([approveAll, denyAll], 'Bash')).toBe(denyAll);
	});

	it('specific deny beats wildcard approve', () => {
		const approveAll = makeRule({toolName: '*', action: 'approve'});
		const denyBash = makeRule({toolName: 'Bash', action: 'deny'});
		expect(matchRule([approveAll, denyBash], 'Bash')).toBe(denyBash);
	});

	it('returns undefined for empty rules array', () => {
		expect(matchRule([], 'Bash')).toBeUndefined();
	});
});
