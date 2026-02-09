export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type TodoItem = {
	content: string;
	status: TodoStatus;
	activeForm?: string;
};

export type TodoWriteInput = {
	todos?: TodoItem[];
};

// ── New CRUD task tool types (replaced TodoWrite in Claude Code) ─────

/** Tool names that represent task management tools (both legacy and new). */
export const TASK_TOOL_NAMES = new Set([
	'TodoWrite', // Legacy
	'TaskCreate',
	'TaskUpdate',
	'TaskList',
	'TaskGet',
]);

export type TaskCreateInput = {
	subject: string;
	description: string;
	activeForm?: string;
	metadata?: Record<string, unknown>;
};

export type TaskUpdateInput = {
	taskId: string;
	status?: TodoStatus | 'deleted';
	subject?: string;
	description?: string;
	activeForm?: string;
	addBlocks?: string[];
	addBlockedBy?: string[];
	owner?: string;
	metadata?: Record<string, unknown>;
};
