import chalk from 'chalk';
import {type TodoItem} from '../types/todo.js';
import {todoGlyphSet as getTodoGlyphSet, getGlyphs} from '../glyphs/index.js';

export type TodoPanelStatus = 'open' | 'doing' | 'blocked' | 'done' | 'failed';

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
			return 'failed';
		default:
			return 'open';
	}
}

export type TodoGlyphs = {
	statusGlyph: (status: TodoPanelStatus) => string;
	caret: string;
	dividerChar: string;
	scrollUp: string;
	scrollDown: string;
};

export type TodoGlyphColors = {
	doing: string;
	done: string;
	failed: string;
	blocked: string;
	text: string;
	textMuted: string;
	default: string;
};

function colorForStatus(
	status: TodoPanelStatus,
	colors: TodoGlyphColors,
): string {
	switch (status) {
		case 'doing':
			return colors.doing;
		case 'done':
			return colors.done;
		case 'failed':
			return colors.failed;
		case 'blocked':
			return colors.blocked;
		default:
			return colors.default;
	}
}

export function todoGlyphs(
	ascii = false,
	colors?: TodoGlyphColors,
): TodoGlyphs {
	const table = getTodoGlyphSet(ascii);
	return {
		statusGlyph(status: TodoPanelStatus): string {
			const raw = table[status];
			if (!colors) return raw;
			return chalk.hex(colorForStatus(status, colors))(raw);
		},
		caret: table.caret,
		dividerChar: getGlyphs(ascii)['general.divider'],
		scrollUp: table.scrollUp,
		scrollDown: table.scrollDown,
	};
}
