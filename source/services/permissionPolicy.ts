import {type HookRule, matchRule} from '../types/rules.js';

export type ToolCategory = 'safe' | 'dangerous';

/**
 * Tools that require explicit permission.
 * Exact names or the special 'mcp__' prefix pattern.
 */
export const DANGEROUS_TOOL_PATTERNS: readonly string[] = [
	'Bash',
	'Write',
	'Edit',
	'NotebookEdit',
];

/**
 * Tools that auto-passthrough (never prompt).
 */
export const SAFE_TOOLS: readonly string[] = [
	'Read',
	'Glob',
	'Grep',
	'WebSearch',
	'WebFetch',
	'Task',
	'TodoRead',
	'TodoWrite',
];

/**
 * Classify a tool as safe or dangerous.
 * MCP tools (prefixed with mcp__) are always dangerous.
 * Unknown tools default to dangerous.
 */
export function getToolCategory(toolName: string): ToolCategory {
	if (SAFE_TOOLS.includes(toolName)) return 'safe';
	if (DANGEROUS_TOOL_PATTERNS.includes(toolName)) return 'dangerous';
	if (toolName.startsWith('mcp__')) return 'dangerous';
	// Unknown tools are dangerous by default
	return 'dangerous';
}

/**
 * Check whether a tool requires permission from the user.
 * Returns false if the tool is safe OR if a matching rule already exists.
 */
export function isPermissionRequired(
	toolName: string,
	rules: HookRule[],
): boolean {
	if (getToolCategory(toolName) === 'safe') return false;
	// If there's already a rule (approve or deny), no need to prompt
	return matchRule(rules, toolName) === undefined;
}
