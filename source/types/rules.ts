/**
 * Hook rule types.
 *
 * Rules control how PreToolUse events are handled automatically.
 * Deny rules are checked first, then approve. First match wins.
 */

export type RuleAction = 'deny' | 'approve';

export type HookRule = {
	id: string;
	toolName: string; // '*' for all tools
	action: RuleAction;
	addedBy: string; // command that created the rule
};

/**
 * Check if a rule's toolName pattern matches a given tool name.
 *
 * Supports three patterns:
 * - `*` — matches everything
 * - `mcp__server__*` — matches any action from that MCP server
 * - exact string — matches only that tool name
 */
function ruleMatches(ruleToolName: string, toolName: string): boolean {
	if (ruleToolName === '*') return true;
	if (ruleToolName === toolName) return true;

	// Prefix pattern: "mcp__server__*" matches "mcp__server__<anything>"
	if (ruleToolName.endsWith('__*')) {
		const prefix = ruleToolName.slice(0, -1); // "mcp__server__"
		return toolName.startsWith(prefix);
	}

	return false;
}

/**
 * Find the first matching rule for a tool name.
 * Deny rules are checked first, then approve. First match wins.
 */
export function matchRule(
	rules: HookRule[],
	toolName: string,
): HookRule | undefined {
	const denyMatch = rules.find(
		r => r.action === 'deny' && ruleMatches(r.toolName, toolName),
	);
	if (denyMatch) return denyMatch;
	return rules.find(
		r => r.action === 'approve' && ruleMatches(r.toolName, toolName),
	);
}
