import {describe, it, expect, vi} from 'vitest';
import {tasksCommand} from '../builtins/tasks';

describe('tasks command', () => {
	it('has correct name and category', () => {
		expect(tasksCommand.name).toBe('tasks');
		expect(tasksCommand.category).toBe('hook');
	});

	it('calls feed.printTaskSnapshot', () => {
		const printTaskSnapshot = vi.fn();
		tasksCommand.execute({
			args: {},
			feed: {printTaskSnapshot},
		} as unknown as Parameters<typeof tasksCommand.execute>[0]);
		expect(printTaskSnapshot).toHaveBeenCalled();
	});
});
