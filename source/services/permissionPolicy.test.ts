import {describe, it, expect} from 'vitest';
import {
	isPermissionRequired,
	getToolCategory,
	DANGEROUS_TOOL_PATTERNS,
	SAFE_TOOLS,
} from './permissionPolicy.js';
import {type HookRule} from '../types/rules.js';

function makeRule(
	overrides: Partial<HookRule> & {toolName: string; action: HookRule['action']},
): HookRule {
	return {id: `rule-${Math.random()}`, addedBy: '/test', ...overrides};
}

describe('permissionPolicy', () => {
	describe('getToolCategory', () => {
		it('classifies Bash as dangerous', () => {
			expect(getToolCategory('Bash')).toBe('dangerous');
		});

		it('classifies Write as dangerous', () => {
			expect(getToolCategory('Write')).toBe('dangerous');
		});

		it('classifies Edit as dangerous', () => {
			expect(getToolCategory('Edit')).toBe('dangerous');
		});

		it('classifies MCP tools as dangerous by prefix', () => {
			expect(getToolCategory('mcp__browser__navigate')).toBe('dangerous');
			expect(getToolCategory('mcp__agent-web-interface__click')).toBe(
				'dangerous',
			);
		});

		it('classifies Read as safe', () => {
			expect(getToolCategory('Read')).toBe('safe');
		});

		it('classifies Glob as safe', () => {
			expect(getToolCategory('Glob')).toBe('safe');
		});

		it('classifies Grep as safe', () => {
			expect(getToolCategory('Grep')).toBe('safe');
		});

		it('classifies Task as safe', () => {
			expect(getToolCategory('Task')).toBe('safe');
		});

		it('classifies AskUserQuestion as safe', () => {
			expect(getToolCategory('AskUserQuestion')).toBe('safe');
		});

		it('classifies unknown tools as dangerous by default', () => {
			expect(getToolCategory('SomeNewTool')).toBe('dangerous');
		});
	});

	describe('isPermissionRequired', () => {
		it('returns true for dangerous tools with no rules', () => {
			expect(isPermissionRequired('Bash', [])).toBe(true);
		});

		it('returns false for safe tools', () => {
			expect(isPermissionRequired('Read', [])).toBe(false);
		});

		it('returns false for AskUserQuestion (safe tool)', () => {
			expect(isPermissionRequired('AskUserQuestion', [])).toBe(false);
		});

		it('returns false when an approve rule exists for the tool', () => {
			const rules = [makeRule({toolName: 'Bash', action: 'approve'})];
			expect(isPermissionRequired('Bash', rules)).toBe(false);
		});

		it('returns false when a deny rule exists for the tool', () => {
			const rules = [makeRule({toolName: 'Bash', action: 'deny'})];
			expect(isPermissionRequired('Bash', rules)).toBe(false);
		});

		it('returns false when a wildcard approve rule exists', () => {
			const rules = [makeRule({toolName: '*', action: 'approve'})];
			expect(isPermissionRequired('Bash', rules)).toBe(false);
		});

		it('returns true for MCP tools with no rules', () => {
			expect(isPermissionRequired('mcp__browser__click', [])).toBe(true);
		});
	});

	describe('constants', () => {
		it('DANGEROUS_TOOL_PATTERNS includes expected tools', () => {
			expect(DANGEROUS_TOOL_PATTERNS).toContain('Bash');
			expect(DANGEROUS_TOOL_PATTERNS).toContain('Write');
			expect(DANGEROUS_TOOL_PATTERNS).toContain('Edit');
		});

		it('SAFE_TOOLS includes expected tools', () => {
			expect(SAFE_TOOLS).toContain('Read');
			expect(SAFE_TOOLS).toContain('Glob');
			expect(SAFE_TOOLS).toContain('Grep');
		});
	});
});
