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
	return {
		ui: {
			args: {},
			messages: [],
			setMessages: vi.fn(),
			addMessage: vi.fn(),
			exit: vi.fn(),
			clearScreen: vi.fn(),
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

		expect(ctx.prompt.spawn).toHaveBeenCalledWith('commit: fix bug', undefined);
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
