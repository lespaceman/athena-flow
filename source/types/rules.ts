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
 * Find the first matching rule for a tool name.
 * Deny rules are checked first, then approve. First match wins.
 */
export function matchRule(
	rules: HookRule[],
	toolName: string,
): HookRule | undefined {
	const denyMatch = rules.find(
		r => r.action === 'deny' && (r.toolName === toolName || r.toolName === '*'),
	);
	if (denyMatch) return denyMatch;
	return rules.find(
		r =>
			r.action === 'approve' && (r.toolName === toolName || r.toolName === '*'),
	);
}
