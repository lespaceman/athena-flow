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
		});
		expect(expandToolOutput).toHaveBeenCalledWith('t42');
	});

	it('does nothing when toolId is missing', () => {
		const expandToolOutput = vi.fn();
		openCommand.execute({
			args: {},
			hookServer: {expandToolOutput} as any,
		});
		expect(expandToolOutput).not.toHaveBeenCalled();
	});
});
