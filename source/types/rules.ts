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
