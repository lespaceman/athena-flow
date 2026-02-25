import stringWidth from 'string-width';
import sliceAnsi from 'slice-ansi';
import {parseToolName} from './toolNameParser.js';

export function compactText(value: string, max: number): string {
	const clean = value.replace(/\s+/g, ' ').trim();
	if (max <= 0) return '';
	const w = stringWidth(clean);
	if (w <= max) return clean;
	if (max <= 3) return sliceAnsi(clean, 0, max);
	return sliceAnsi(clean, 0, max - 3) + '...';
}

export function fit(text: string, width: number): string {
	if (width <= 0) return '';
	const w = stringWidth(text);
	if (w <= width) {
		const pad = width - w;
		return pad > 0 ? text + ' '.repeat(pad) : text;
	}
	if (width <= 3) return sliceAnsi(text, 0, width);
	return sliceAnsi(text, 0, width - 3) + '...';
}

/**
 * ANSI-aware fit: truncates by visual width while preserving ANSI escape
 * codes and non-ASCII content characters. Uses string-width for measurement
 * and slice-ansi for truncation.
 *
 * Note: string-width may undercount some complex scripts (Devanagari, Tamil)
 * due to terminal rendering inconsistencies. This can cause slight padding
 * misalignment for those characters, but preserves readable content.
 */
export function fitAnsi(text: string, width: number): string {
	if (width <= 0) return '';
	const visualWidth = stringWidth(text);
	if (visualWidth <= width) {
		const pad = width - visualWidth;
		return pad > 0 ? text + ' '.repeat(pad) : text;
	}
	if (width <= 3) return sliceAnsi(text, 0, width);
	return sliceAnsi(text, 0, width - 3) + '...';
}

export function formatClock(timestamp: number): string {
	const d = new Date(timestamp);
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	return `${hh}:${mm}`;
}

export function formatCount(value: number | null): string {
	if (value === null) return '--';
	return value.toLocaleString('en-US');
}

export function formatSessionLabel(sessionId: string | undefined): string {
	if (!sessionId) return 'S-';
	const tail = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
	return `S${tail || '-'}`;
}

export function formatRunLabel(runId: string | undefined): string {
	if (!runId) return 'R-';
	const direct = runId.match(/^(R\d+)$/i);
	if (direct) return direct[1]!.toUpperCase();
	const tail = runId.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
	return `R${tail || '-'}`;
}

export function actorLabel(actorId: string): string {
	if (actorId === 'user') return 'USER';
	if (actorId === 'agent:root') return 'AGENT';
	if (actorId === 'system') return 'SYSTEM';
	if (actorId.startsWith('subagent:')) {
		return 'SUB-AGENT';
	}
	return compactText(actorId.toUpperCase(), 12);
}

export function summarizeValue(value: unknown): string {
	if (typeof value === 'string') return compactText(JSON.stringify(value), 28);
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (value === null || value === undefined) return String(value);
	if (Array.isArray(value)) return `[${value.length}]`;
	if (typeof value === 'object') return '{...}';
	return compactText(String(value), 20);
}

export function summarizeToolInput(input: Record<string, unknown>): string {
	const entries = Object.entries(input);
	const pairs = entries
		.slice(0, 2)
		.map(([key, value]) => `${key}=${summarizeValue(value)}`);
	const overflow = entries.length - 2;
	if (overflow > 0) {
		pairs.push(`+${overflow}`);
	}
	return pairs.join(' ');
}

export function shortenPath(filePath: string): string {
	const segments = filePath.split('/').filter(Boolean);
	if (segments.length <= 2) return segments.join('/');
	return '…/' + segments.slice(-2).join('/');
}

export type StructuredPath = {prefix: string; filename: string};

export function shortenPathStructured(filePath: string): StructuredPath {
	const segments = filePath.split('/').filter(Boolean);
	if (segments.length === 0) return {prefix: '', filename: filePath};
	const filename = segments[segments.length - 1]!;
	if (segments.length === 1) return {prefix: '', filename};
	if (segments.length === 2) return {prefix: segments[0] + '/', filename};
	return {prefix: '…/' + segments[segments.length - 2] + '/', filename};
}

const filePathExtractor = (input: Record<string, unknown>): string =>
	shortenPath(String(input.file_path ?? ''));

const PRIMARY_INPUT_EXTRACTORS: Record<
	string,
	(input: Record<string, unknown>) => string
> = {
	Read: filePathExtractor,
	Write: filePathExtractor,
	Edit: filePathExtractor,
	Bash: input => compactText(String(input.command ?? ''), 40),
	Glob: input => String(input.pattern ?? ''),
	Grep: input => {
		const p = `"${String(input.pattern ?? '')}"`;
		const g = input.glob ? ` ${String(input.glob)}` : '';
		return p + g;
	},
	Task: input => compactText(String(input.description ?? ''), 60),
	WebSearch: input => `"${String(input.query ?? '')}"`,
	WebFetch: input => compactText(String(input.url ?? ''), 60),
	Skill: input => {
		const name = String(input.skill ?? '');
		const colonIdx = name.indexOf(':');
		return compactText(colonIdx >= 0 ? name.slice(colonIdx + 1) : name, 40);
	},
	NotebookEdit: input => {
		const path = String(input.notebook_path ?? '');
		return path ? shortenPath(path) : '';
	},
};

const eidExtractor = (input: Record<string, unknown>): string => {
	const eid = String(input.eid ?? '');
	return eid ? `eid:${eid.slice(0, 6)}…` : '';
};

/** Extractors keyed by MCP action name (for MCP tools). */
const MCP_INPUT_EXTRACTORS: Record<
	string,
	(input: Record<string, unknown>) => string
> = {
	navigate: input => {
		const url = String(input.url ?? '');
		try {
			const u = new URL(url);
			return u.hostname.replace(/^www\./, '');
		} catch {
			return compactText(url, 40);
		}
	},
	find_elements: input => {
		const parts: string[] = [];
		if (input.kind) parts.push(String(input.kind));
		if (input.label) parts.push(`"${String(input.label)}"`);
		return parts.join(' ') || '';
	},
	click: eidExtractor,
	type: input => {
		const text = String(input.text ?? '');
		const eid = input.eid ? String(input.eid).slice(0, 5) + '…' : '';
		const quoted = `"${compactText(text, 30)}"`;
		return eid ? `${quoted} → ${eid}` : quoted;
	},
	hover: eidExtractor,
	select: input => {
		const value = String(input.value ?? '');
		return value ? `"${compactText(value, 30)}"` : '';
	},
	press: input => String(input.key ?? ''),
	scroll_page: input => String(input.direction ?? ''),
	take_screenshot: () => '',
	close_session: () => '',
	close_page: () => '',
};

export function summarizeToolPrimaryInput(
	toolName: string,
	toolInput: Record<string, unknown>,
): string {
	if (Object.keys(toolInput).length === 0) return '';
	const extractor = PRIMARY_INPUT_EXTRACTORS[toolName];
	if (extractor) return extractor(toolInput);
	const parsed = parseToolName(toolName);
	if (parsed.isMcp && parsed.mcpAction) {
		const mcpExtractor = MCP_INPUT_EXTRACTORS[parsed.mcpAction];
		if (mcpExtractor) return mcpExtractor(toolInput);
	}
	return summarizeToolInput(toolInput);
}

export const MAX_INPUT_ROWS = 6;
const CURSOR_ON = '\x1b[7m';
const CURSOR_OFF = '\x1b[27m';

/**
 * Renders input text with ANSI block cursor, supporting multi-line wrapping.
 * Returns an array of strings (1 to MAX_INPUT_ROWS lines).
 */
export function renderInputLines(
	value: string,
	cursorOffset: number,
	width: number,
	showCursor: boolean,
	placeholder: string,
): string[] {
	if (width <= 0) return [''];

	if (value.length === 0) {
		if (!showCursor) return [fit(placeholder, width)];
		const cursor = `${CURSOR_ON} ${CURSOR_OFF}`;
		return [cursor + fit(placeholder, width - 1)];
	}

	if (!showCursor) {
		const rawLines = wrapText(value, width);
		const visible = rawLines.slice(0, MAX_INPUT_ROWS);
		return visible.map(line => fit(line, width));
	}

	const rawLines = wrapText(value, width);

	// Find which line the cursor is on
	let charCount = 0;
	let cursorLine = 0;
	let cursorCol = 0;
	for (let i = 0; i < rawLines.length; i++) {
		const lineLen = rawLines[i]!.length;
		if (cursorOffset <= charCount + lineLen) {
			cursorLine = i;
			cursorCol = cursorOffset - charCount;
			break;
		}
		charCount += lineLen;
	}

	// Viewport scrolling when more than MAX_INPUT_ROWS
	let viewStart = 0;
	if (rawLines.length > MAX_INPUT_ROWS) {
		viewStart = Math.max(
			0,
			Math.min(
				cursorLine - Math.floor(MAX_INPUT_ROWS / 2),
				rawLines.length - MAX_INPUT_ROWS,
			),
		);
	}
	const visibleLines = rawLines.slice(viewStart, viewStart + MAX_INPUT_ROWS);

	// Render each line, inserting block cursor on the cursor line
	return visibleLines.map((line, i) => {
		const globalIdx = viewStart + i;
		if (globalIdx === cursorLine) {
			const before = line.slice(0, cursorCol);
			const charAtCursor = cursorCol < line.length ? line[cursorCol] : ' ';
			const after = cursorCol < line.length ? line.slice(cursorCol + 1) : '';
			const rendered = `${before}${CURSOR_ON}${charAtCursor}${CURSOR_OFF}${after}`;
			return fitAnsi(rendered, width);
		}
		return fit(line, width);
	});
}

function wrapText(text: string, width: number): string[] {
	if (width <= 0) return [text];
	const lines: string[] = [];
	for (const segment of text.split('\n')) {
		if (segment.length === 0) {
			lines.push('');
			continue;
		}
		for (let i = 0; i < segment.length; i += width) {
			lines.push(segment.slice(i, i + width));
		}
	}
	return lines;
}

export function formatInputBuffer(
	value: string,
	cursorOffset: number,
	width: number,
	showCursor: boolean,
	placeholder: string,
): string {
	if (width <= 0) return '';
	if (value.length === 0) {
		if (!showCursor) return fit(placeholder, width);
		return fit(`|${placeholder}`, width);
	}

	if (!showCursor) {
		return fit(value, width);
	}

	const withCursor =
		value.slice(0, cursorOffset) + '|' + value.slice(cursorOffset);
	if (withCursor.length <= width) return withCursor.padEnd(width, ' ');

	const desiredStart = Math.max(0, cursorOffset + 1 - Math.floor(width * 0.65));
	const start = Math.min(desiredStart, withCursor.length - width);
	return fit(withCursor.slice(start, start + width), width);
}
