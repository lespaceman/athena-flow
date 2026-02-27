import {describe, it, expect, vi} from 'vitest';
import {sessionsCommand} from '../builtins/sessions';
import {type UICommandContext} from '../types';

const NULL_TOKENS = {
	input: null,
	output: null,
	cacheRead: null,
	cacheWrite: null,
	total: null,
	contextSize: null,
};

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
		sessionStats: {
			metrics: {
				modelName: null,
				toolCallCount: 0,
				totalToolCallCount: 0,
				subagentCount: 0,
				subagentMetrics: [],
				permissions: {allowed: 0, denied: 0},
				sessionStartTime: null,
				tokens: NULL_TOKENS,
			},
			tokens: NULL_TOKENS,
			elapsed: 0,
		},
		...overrides,
	};
}

describe('sessionsCommand', () => {
	it('calls showSessions on execute', () => {
		const ctx = makeUIContext();
		sessionsCommand.execute(ctx);
		expect(ctx.showSessions).toHaveBeenCalled();
	});
});
