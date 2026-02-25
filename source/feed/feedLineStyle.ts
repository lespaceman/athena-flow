import chalk, {type ChalkInstance} from 'chalk';
import {type Theme} from '../theme/types.js';
import {GLYPH_REGISTRY, getGlyphs} from '../glyphs/index.js';
import {
	FEED_EVENT_COL_START,
	FEED_EVENT_COL_END,
	FEED_SUMMARY_COL_START,
} from './timeline.js';

/** All known collapsed glyphs (unicode + ascii). */
const COLLAPSED_GLYPHS = new Set([
	GLYPH_REGISTRY['feed.expandCollapsed'].unicode,
	GLYPH_REGISTRY['feed.expandCollapsed'].ascii,
]);

/** All known expanded glyphs (unicode + ascii). */
const EXPANDED_GLYPHS = new Set([
	GLYPH_REGISTRY['feed.expandExpanded'].unicode,
	GLYPH_REGISTRY['feed.expandExpanded'].ascii,
]);

export type FeedLineStyleOptions = {
	focused: boolean;
	matched: boolean;
	actorId: string;
	isError: boolean;
	theme: Theme;
	ascii?: boolean;
	opTag?: string;
	/** Char offset within summary where dim styling should begin. */
	summaryDimStart?: number;
	/** True when the outcome represents a zero result (e.g., "0 files"). */
	outcomeZero?: boolean;
	/** True when this line starts a new event category group. */
	categoryBreak?: boolean;
};

function opCategoryColor(op: string, theme: Theme): string | undefined {
	if (op === 'tool.ok') return theme.status.success;
	if (op === 'tool.fail') return theme.status.error;
	if (op.startsWith('tool.')) return theme.status.warning;
	if (op.startsWith('perm.')) return theme.accentSecondary;
	if (op === 'agent.msg') return theme.status.info;
	if (
		op.startsWith('run.') ||
		op.startsWith('sess.') ||
		op.startsWith('stop.') ||
		op.startsWith('sub.')
	)
		return theme.textMuted;
	return undefined;
}

function actorStyle(actorId: string, theme: Theme): ChalkInstance {
	if (actorId === 'system') return chalk.dim.hex(theme.textMuted);
	if (actorId === 'user') return chalk.hex(theme.userMessage.text);
	return chalk.hex(theme.text);
}

export function styleFeedLine(
	line: string,
	opts: FeedLineStyleOptions,
): string {
	const {focused, matched, actorId, isError, theme, ascii} = opts;

	// Focused row: inverse accent on entire line, no glyph coloring needed
	if (focused) {
		return chalk.hex(theme.accent).inverse(line);
	}

	// Error overrides actor color
	const base = isError
		? chalk.hex(theme.status.error)
		: actorStyle(actorId, theme);

	// Determine if EVENT segment gets separate coloring
	const opColor =
		opts.opTag && !isError ? opCategoryColor(opts.opTag, theme) : undefined;

	// Compute dim boundary: absolute char position in line where dim starts
	const dimPos =
		opts.summaryDimStart !== undefined
			? FEED_SUMMARY_COL_START + opts.summaryDimStart
			: undefined;

	// Detect expand/collapse glyph at end of line
	const trimmed = line.trimEnd();
	const lastChar = trimmed.at(-1);
	const hasGlyph = lastChar && trimmed.length >= 2 && trimmed.at(-2) === ' ';
	const glyphPos = hasGlyph ? trimmed.length - 1 : undefined;

	// Determine gutter glyph (position 0) — replaces the leading space
	let gutterChar: string;
	let gutterStyle: ChalkInstance;
	if (matched) {
		gutterChar = getGlyphs(ascii)['feed.searchMatch'];
		gutterStyle = chalk.hex(theme.accent);
	} else if (opts.opTag === 'prompt' || opts.opTag === 'msg.user') {
		const borderColor = theme.userMessage.border ?? theme.accent;
		gutterChar = getGlyphs(ascii)['feed.userBorder'];
		gutterStyle = chalk.hex(borderColor);
	} else if (
		opts.categoryBreak &&
		opts.opTag !== 'prompt' &&
		opts.opTag !== 'msg.user'
	) {
		gutterChar = '·';
		gutterStyle = chalk.dim.hex(theme.textMuted);
	} else {
		gutterChar = ' ';
		gutterStyle = base;
	}

	// Build styled string by painting segments
	let styled = gutterStyle(gutterChar);
	const segments: {start: number; end: number; style: ChalkInstance}[] = [];

	// TIME segment (1..EVENT_START)
	segments.push({start: 1, end: FEED_EVENT_COL_START, style: base});
	// EVENT segment (colored by category)
	segments.push({
		start: FEED_EVENT_COL_START,
		end: FEED_EVENT_COL_END,
		style: opColor ? chalk.hex(opColor) : base,
	});

	// After EVENT: detail + actor + summary (may have dim portion and glyph)
	const afterEventEnd = glyphPos ?? line.length;
	if (dimPos !== undefined && dimPos < afterEventEnd) {
		segments.push({start: FEED_EVENT_COL_END, end: dimPos, style: base});
		// Dim portion — use explicit muted color (dim SGR is unreliable with truecolor)
		const dimStyle = opts.outcomeZero
			? chalk.hex(theme.status.warning)
			: chalk.hex(theme.textMuted);
		segments.push({
			start: dimPos,
			end: afterEventEnd,
			style: dimStyle,
		});
	} else {
		segments.push({start: FEED_EVENT_COL_END, end: afterEventEnd, style: base});
	}

	// Glyph segment
	if (glyphPos !== undefined && lastChar) {
		let glyphStyle: ChalkInstance = base;
		if (COLLAPSED_GLYPHS.has(lastChar)) {
			glyphStyle = chalk.hex(theme.accent);
		} else if (EXPANDED_GLYPHS.has(lastChar)) {
			glyphStyle = chalk.hex(theme.status.success);
		}
		segments.push({
			start: glyphPos,
			end: glyphPos + lastChar.length,
			style: glyphStyle,
		});
		// Trailing spaces after glyph
		if (glyphPos + lastChar.length < line.length) {
			segments.push({
				start: glyphPos + lastChar.length,
				end: line.length,
				style: base,
			});
		}
	}

	for (const seg of segments) {
		styled += seg.style(line.slice(seg.start, seg.end));
	}

	return styled;
}
