import chalk from 'chalk';
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
	default: string;
};

type GlyphKeys = TodoPanelStatus | 'caret' | 'dividerChar' | 'scrollUp' | 'scrollDown';

const GLYPH_TABLE = {
	unicode: {
		doing: '■',
		done: '✓',
		open: '□',
		blocked: '□',
		caret: '▶',
		dividerChar: '─',
		scrollUp: '▲',
		scrollDown: '▼',
	} satisfies Record<GlyphKeys, string>,
	ascii: {
		doing: '*',
		done: 'x',
		open: '-',
		blocked: '-',
		caret: '>',
		dividerChar: '-',
		scrollUp: '^',
		scrollDown: 'v',
	} satisfies Record<GlyphKeys, string>,
} as const;

function colorForStatus(
	status: TodoPanelStatus,
	colors: TodoGlyphColors,
): string {
	switch (status) {
		case 'doing':
			return colors.doing;
		case 'done':
			return colors.done;
		default:
			return colors.default;
	}
}

export function todoGlyphs(
	ascii = false,
	colors?: TodoGlyphColors,
): TodoGlyphs {
	const table = ascii ? GLYPH_TABLE.ascii : GLYPH_TABLE.unicode;
	return {
		statusGlyph(status: TodoPanelStatus): string {
			const raw = table[status];
			if (!colors) return raw;
			return chalk.hex(colorForStatus(status, colors))(raw);
		},
		caret: table.caret,
		dividerChar: table.dividerChar,
		scrollUp: table.scrollUp,
		scrollDown: table.scrollDown,
	};
}
