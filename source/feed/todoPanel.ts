import {type TodoItem} from '../types/todo.js';

export type TodoPanelStatus = 'open' | 'doing' | 'blocked' | 'done';

export type TodoPanelItem = {
	id: string;
	text: string;
	priority: 'P0' | 'P1' | 'P2';
	status: TodoPanelStatus;
	linkedEventId?: string;
	owner?: string;
	localOnly?: boolean;
};

export function toTodoStatus(status: TodoItem['status']): TodoPanelStatus {
	switch (status) {
		case 'in_progress':
			return 'doing';
		case 'completed':
			return 'done';
		case 'failed':
			return 'blocked';
		default:
			return 'open';
	}
}

export function symbolForTodoStatus(status: TodoPanelStatus): string {
	switch (status) {
		case 'done':
			return '[x]';
		case 'doing':
			return '[>]';
		case 'blocked':
			return '[!]';
		default:
			return '[ ]';
	}
}
