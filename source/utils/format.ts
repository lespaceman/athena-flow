import stringWidth from 'string-width';
import sliceAnsi from 'slice-ansi';

export function toAscii(value: string): string {
	return value.replace(/[^\x20-\x7e]/g, '?');
}

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
		return `SA-${compactText(actorId.slice('subagent:'.length), 8)}`;
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
