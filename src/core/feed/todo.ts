export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type TodoItem = {
	content: string;
	status: TodoStatus;
	activeForm?: string;
};

export type TodoWriteInput = {
	todos?: TodoItem[];
};

/** Tool names whose events are aggregated into the sticky task widget. */
export const TASK_TOOL_NAMES = new Set([
	'TodoWrite',
	'TaskCreate',
	'TaskUpdate',
	'TaskList',
	'TaskGet',
]);
