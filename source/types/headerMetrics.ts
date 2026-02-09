/**
 * Types for the dynamic Header component's metrics and state.
 */

export type TokenUsage = {
	input: number | null;
	output: number | null;
	cacheRead: number | null;
	cacheWrite: number | null;
	total: number | null;
	contextPercent: number | null;
};

export type SubagentMetrics = {
	agentId: string;
	agentType: string;
	toolCallCount: number;
	tokenCount: number | null;
};

export type PermissionMetrics = {
	allowed: number;
	denied: number;
};

export type SessionMetrics = {
	modelName: string | null;
	toolCallCount: number;
	subagentCount: number;
	subagentMetrics: SubagentMetrics[];
	permissions: PermissionMetrics;
	sessionStartTime: Date | null;
	tokens: TokenUsage;
};

export type ClaudeState = 'idle' | 'working' | 'waiting' | 'error';
