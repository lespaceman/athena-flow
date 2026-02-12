import {describe, it, expect, vi} from 'vitest';
import {statsCommand} from '../builtins/stats.js';
import {type UICommandContext} from '../types.js';
import type {SessionStatsSnapshot} from '../../types/headerMetrics.js';

const NULL_TOKENS = {
	input: null,
	output: null,
	cacheRead: null,
	cacheWrite: null,
	total: null,
	contextSize: null,
};

function makeSessionStats(): SessionStatsSnapshot {
	return {
		metrics: {
			modelName: 'claude-opus-4-6',
			toolCallCount: 3,
			totalToolCallCount: 8,
			subagentCount: 1,
			subagentMetrics: [
				{
					agentId: 'a1',
					agentType: 'Explore',
					toolCallCount: 5,
					tokenCount: null,
				},
			],
			permissions: {allowed: 4, denied: 0},
			sessionStartTime: new Date('2024-01-15T10:00:00Z'),
			tokens: NULL_TOKENS,
		},
		tokens: {
			input: 10000,
			output: 5000,
			cacheRead: null,
			cacheWrite: null,
			total: 15000,
			contextSize: null,
		},
		elapsed: 120,
	};
}

function makeUIContext(
	overrides?: Partial<UICommandContext>,
): UICommandContext {
	return {
		args: {},
		messages: [],
		setMessages: vi.fn(),
		addMessage: vi.fn(),
		exit: vi.fn(),
		clearScreen: vi.fn(),
		showSessions: vi.fn(),
		sessionStats: makeSessionStats(),
		...overrides,
	};
}

describe('statsCommand', () => {
	it('adds a message with session statistics', () => {
		const ctx = makeUIContext();
		statsCommand.execute(ctx);

		expect(ctx.addMessage).toHaveBeenCalledOnce();
		const msg = vi.mocked(ctx.addMessage).mock.calls[0]![0];
		expect(msg.role).toBe('assistant');
		expect(msg.content).toContain('Session Statistics');
		expect(msg.content).toContain('Opus 4.6');
		expect(msg.content).toContain('8 total (3 main, 5 subagent)');
		expect(msg.content).toContain('2m');
		expect(msg.content).toContain('10k');
	});
});
