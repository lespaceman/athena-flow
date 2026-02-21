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

export const SPINNER_FRAMES = [
	'⠋',
	'⠙',
	'⠹',
	'⠸',
	'⠼',
	'⠴',
	'⠦',
	'⠧',
	'⠇',
	'⠏',
];
export const ASCII_SPINNER_FRAMES = ['|', '/', '-', '\\'];

export type TodoGlyphs = {
	statusGlyph: (status: TodoPanelStatus) => string;
	caret: string;
	dividerChar: string;
	scrollUp: string;
	scrollDown: string;
};

export function todoGlyphs(ascii = false, spinnerFrame = 0): TodoGlyphs {
	const frames = ascii ? ASCII_SPINNER_FRAMES : SPINNER_FRAMES;
	const doingGlyph = frames[spinnerFrame % frames.length]!;
	return {
		statusGlyph: (status: TodoPanelStatus) => {
			switch (status) {
				case 'doing':
					return doingGlyph;
				case 'done':
					return ascii ? 'x' : '✓';
				default:
					return ascii ? '-' : '○';
			}
		},
		caret: ascii ? '>' : '▶',
		dividerChar: ascii ? '-' : '─',
		scrollUp: ascii ? '^' : '▲',
		scrollDown: ascii ? 'v' : '▼',
	};
}
