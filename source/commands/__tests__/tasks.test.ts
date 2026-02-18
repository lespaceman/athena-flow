import {describe, it, expect, vi} from 'vitest';
import {tasksCommand} from '../builtins/tasks.js';

describe('tasks command', () => {
	it('has correct name and category', () => {
		expect(tasksCommand.name).toBe('tasks');
		expect(tasksCommand.category).toBe('hook');
	});

	it('calls hookServer.printTaskSnapshot', () => {
		const printTaskSnapshot = vi.fn();
		tasksCommand.execute({
			args: {},
			feed: {printTaskSnapshot} as any,
		} as any);
		expect(printTaskSnapshot).toHaveBeenCalled();
	});
});
