import {describe, it, expect, vi} from 'vitest';
import {clearCommand} from '../builtins/clear.js';
import {type UICommandContext} from '../types.js';

function makeUIContext(
	overrides?: Partial<UICommandContext>,
): UICommandContext {
	return {
		args: {},
		messages: [{id: '1', role: 'user', content: 'hello'}],
		setMessages: vi.fn(),
		addMessage: vi.fn(),
		exit: vi.fn(),
		clearScreen: vi.fn(),
		...overrides,
	};
}

describe('clearCommand', () => {
	it('clears messages', () => {
		const ctx = makeUIContext();
		clearCommand.execute(ctx);
		expect(ctx.setMessages).toHaveBeenCalledWith([]);
	});

	it('calls clearScreen to wipe the terminal', () => {
		const ctx = makeUIContext();
		clearCommand.execute(ctx);
		expect(ctx.clearScreen).toHaveBeenCalled();
	});
});
