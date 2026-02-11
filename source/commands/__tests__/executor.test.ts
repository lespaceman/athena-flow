import {describe, it, expect, vi} from 'vitest';
import {executeCommand} from '../executor.js';
import {
	type UICommand,
	type PromptCommand,
	type HookCommand,
	type ExecuteCommandContext,
} from '../types.js';

function makeContext(
	overrides?: Partial<ExecuteCommandContext>,
): ExecuteCommandContext {
	const nullTokens = {
		input: null,
		output: null,
		cacheRead: null,
		cacheWrite: null,
		total: null,
		contextPercent: null,
	};
	return {
		ui: {
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
					tokens: nullTokens,
				},
				tokens: nullTokens,
				elapsed: 0,
			},
		},
		hook: {
			args: {},
			hookServer: {} as ExecuteCommandContext['hook']['hookServer'],
		},
		prompt: {
			spawn: vi.fn(),
			currentSessionId: 'session-123',
		},
		...overrides,
	};
}

describe('executeCommand', () => {
	it('calls execute with UICommandContext for ui commands', () => {
		const execute = vi.fn();
		const cmd: UICommand = {
			name: 'clear',
			description: 'Clear messages',
			category: 'ui',
			execute,
		};
		const ctx = makeContext();

		executeCommand(cmd, {}, ctx);

		expect(execute).toHaveBeenCalledWith({...ctx.ui, args: {}});
	});

	it('builds prompt and spawns new session for prompt commands with session "new"', () => {
		const cmd: PromptCommand = {
			name: 'commit',
			description: 'Commit changes',
			category: 'prompt',
			session: 'new',
			buildPrompt: args => `commit: ${args['message'] ?? ''}`,
		};
		const ctx = makeContext();

		executeCommand(cmd, {message: 'fix bug'}, ctx);

		expect(ctx.prompt.spawn).toHaveBeenCalledWith(
			'commit: fix bug',
			undefined,
			undefined,
		);
	});

	it('builds prompt and resumes session for prompt commands with session "resume"', () => {
		const cmd: PromptCommand = {
			name: 'fix',
			description: 'Fix issue',
			category: 'prompt',
			session: 'resume',
			buildPrompt: args => `fix: ${args['description'] ?? ''}`,
		};
		const ctx = makeContext();

		executeCommand(cmd, {description: 'null ref'}, ctx);

		expect(ctx.prompt.spawn).toHaveBeenCalledWith(
			'fix: null ref',
			'session-123',
			undefined,
		);
	});

	it('passes command isolation to spawn for prompt commands', () => {
		const cmd: PromptCommand = {
			name: 'explore',
			description: 'Explore a site',
			category: 'prompt',
			session: 'new',
			isolation: {mcpConfig: '/plugins/test/.mcp.json'},
			buildPrompt: args => `explore: ${args['args'] ?? ''}`,
		};
		const ctx = makeContext();

		executeCommand(cmd, {args: 'https://example.com'}, ctx);

		expect(ctx.prompt.spawn).toHaveBeenCalledWith(
			'explore: https://example.com',
			undefined,
			{mcpConfig: '/plugins/test/.mcp.json'},
		);
	});

	it('passes undefined isolation when command has no isolation', () => {
		const cmd: PromptCommand = {
			name: 'commit',
			description: 'Commit changes',
			category: 'prompt',
			session: 'new',
			buildPrompt: args => `commit: ${args['message'] ?? ''}`,
		};
		const ctx = makeContext();

		executeCommand(cmd, {message: 'fix'}, ctx);

		expect(ctx.prompt.spawn).toHaveBeenCalledWith(
			'commit: fix',
			undefined,
			undefined,
		);
	});

	it('calls execute with HookCommandContext for hook commands', () => {
		const execute = vi.fn();
		const cmd: HookCommand = {
			name: 'block',
			description: 'Block a tool',
			category: 'hook',
			execute,
		};
		const ctx = makeContext();
		const toolArgs = {tool: 'Bash'};

		executeCommand(cmd, toolArgs, ctx);

		expect(execute).toHaveBeenCalledWith({...ctx.hook, args: toolArgs});
	});
});
