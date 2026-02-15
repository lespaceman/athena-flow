import {describe, it, expect, vi} from 'vitest';
import {openCommand} from '../builtins/open.js';

describe('open command', () => {
	it('has correct name and category', () => {
		expect(openCommand.name).toBe('open');
		expect(openCommand.category).toBe('hook');
	});

	it('calls hookServer.expandToolOutput with toolId', () => {
		const expandToolOutput = vi.fn();
		openCommand.execute({
			args: {toolId: 't42'},
			hookServer: {expandToolOutput} as any,
			addMessage: vi.fn(),
		});
		expect(expandToolOutput).toHaveBeenCalledWith('t42');
	});

	it('shows usage message when toolId is missing', () => {
		const expandToolOutput = vi.fn();
		const addMessage = vi.fn();
		openCommand.execute({
			args: {},
			hookServer: {expandToolOutput} as any,
			addMessage,
		});
		expect(expandToolOutput).not.toHaveBeenCalled();
		expect(addMessage).toHaveBeenCalledOnce();
		expect(addMessage.mock.calls[0]![0].content).toContain('Usage');
	});
});
