import {describe, it, expect} from 'vitest';
import {matchRule, type HookRule} from './rules.js';

function makeRule(
	overrides: Partial<HookRule> & {toolName: string; action: HookRule['action']},
): HookRule {
	return {id: `rule-${Math.random()}`, addedBy: '/test', ...overrides};
}

describe('matchRule', () => {
	it('matches exact tool name', () => {
		const rules = [makeRule({toolName: 'Bash', action: 'approve'})];
		expect(matchRule(rules, 'Bash')).toBeDefined();
		expect(matchRule(rules, 'Bash')!.action).toBe('approve');
	});

	it('matches wildcard * rule', () => {
		const rules = [makeRule({toolName: '*', action: 'approve'})];
		expect(matchRule(rules, 'Bash')).toBeDefined();
		expect(matchRule(rules, 'mcp__server__action')).toBeDefined();
	});

	it('returns undefined when no rule matches', () => {
		const rules = [makeRule({toolName: 'Bash', action: 'approve'})];
		expect(matchRule(rules, 'Edit')).toBeUndefined();
	});

	it('deny rules take precedence over approve rules', () => {
		const rules = [
			makeRule({toolName: 'Bash', action: 'approve'}),
			makeRule({toolName: 'Bash', action: 'deny'}),
		];
		expect(matchRule(rules, 'Bash')!.action).toBe('deny');
	});

	describe('MCP server prefix matching', () => {
		it('matches mcp__server__* pattern against any action from that server', () => {
			const rules = [
				makeRule({
					toolName: 'mcp__agent-web-interface__*',
					action: 'approve',
				}),
			];
			expect(matchRule(rules, 'mcp__agent-web-interface__click')).toBeDefined();
			expect(
				matchRule(rules, 'mcp__agent-web-interface__navigate'),
			).toBeDefined();
			expect(matchRule(rules, 'mcp__agent-web-interface__type')).toBeDefined();
		});

		it('does not match different server with prefix pattern', () => {
			const rules = [
				makeRule({
					toolName: 'mcp__agent-web-interface__*',
					action: 'approve',
				}),
			];
			expect(matchRule(rules, 'mcp__other-server__click')).toBeUndefined();
		});

		it('matches plugin MCP prefix patterns', () => {
			const rules = [
				makeRule({
					toolName: 'mcp__plugin_web-testing-toolkit_agent-web-interface__*',
					action: 'approve',
				}),
			];
			expect(
				matchRule(
					rules,
					'mcp__plugin_web-testing-toolkit_agent-web-interface__click',
				),
			).toBeDefined();
		});

		it('deny prefix rules take precedence over approve prefix rules', () => {
			const rules = [
				makeRule({
					toolName: 'mcp__agent-web-interface__*',
					action: 'approve',
				}),
				makeRule({
					toolName: 'mcp__agent-web-interface__*',
					action: 'deny',
				}),
			];
			expect(matchRule(rules, 'mcp__agent-web-interface__click')!.action).toBe(
				'deny',
			);
		});
	});
});
