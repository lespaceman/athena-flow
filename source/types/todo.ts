export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export type TodoItem = {
	content: string;
	status: TodoStatus;
	activeForm?: string;
};

export type TodoWriteInput = {
	todos?: TodoItem[];
};
