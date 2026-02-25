import chalk, {type ChalkInstance} from 'chalk';
import {type Theme} from '../theme/types.js';
import {GLYPH_REGISTRY, getGlyphs} from '../glyphs/index.js';
import {
	FEED_EVENT_COL_START,
	FEED_EVENT_COL_END,
	FEED_ACTOR_COL_END,
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
	/** True when actor is same as previous row (show · instead). */
	duplicateActor?: boolean;
	/** True when the minute changed between this row and the previous. */
	minuteBreak?: boolean;
};

function opCategoryColor(op: string, theme: Theme): string | undefined {
	if (op === 'tool.fail') return theme.status.error;
	if (op === 'tool.ok' || op.startsWith('tool.')) return theme.textMuted;
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

	// Focused row: accent-colored left border + bright text (no inverse)
	if (focused) {
		const g = getGlyphs(ascii);
		const border = chalk.hex(theme.accent)(g['feed.focusBorder']);
		const rest = chalk.hex(theme.text)(line.slice(1));
		return border + rest;
	}

	// Error overrides actor color
	const base = isError
		? chalk.hex(theme.status.error)
		: actorStyle(actorId, theme);

	// Full-row dimming: lifecycle and Tool OK events get muted base for all segments
	const isLifecycleRow =
		opts.opTag !== undefined &&
		/^(run\.|sess\.|stop\.|sub\.)/.test(opts.opTag);
	const isToolOk = opts.opTag === 'tool.ok';
	const rowBase =
		!isError && (isLifecycleRow || isToolOk)
			? chalk.hex(theme.textMuted)
			: base;

	// Agent messages: summary text uses info color (blue)
	const isAgentMsg = opts.opTag === 'agent.msg';
	const summaryBase = isAgentMsg ? chalk.hex(theme.status.info) : rowBase;

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

	// Determine gutter glyph (position 0) — replaces the leading space.
	// Priority: matched > user border > minute break > category break > default.
	// Note: prompt/msg.user are caught by the user-border branch, so the
	// minute-break and category-break branches never need to exclude them.
	let gutterChar: string;
	let gutterStyle: ChalkInstance;
	if (matched) {
		gutterChar = getGlyphs(ascii)['feed.searchMatch'];
		gutterStyle = chalk.hex(theme.accent);
	} else if (opts.opTag === 'prompt' || opts.opTag === 'msg.user') {
		const borderColor = theme.userMessage.border ?? theme.accent;
		gutterChar = getGlyphs(ascii)['feed.userBorder'];
		gutterStyle = chalk.hex(borderColor);
	} else if (opts.minuteBreak && !opts.categoryBreak) {
		gutterChar = '─';
		gutterStyle = chalk.dim.hex(theme.textMuted);
	} else if (opts.categoryBreak) {
		gutterChar = '·';
		gutterStyle = chalk.dim.hex(theme.textMuted);
	} else {
		gutterChar = ' ';
		gutterStyle = rowBase;
	}

	// Build styled string by painting segments
	let styled = gutterStyle(gutterChar);
	const segments: {start: number; end: number; style: ChalkInstance}[] = [];

	// TIME segment (1..EVENT_START)
	segments.push({start: 1, end: FEED_EVENT_COL_START, style: rowBase});
	// EVENT segment (colored by category)
	segments.push({
		start: FEED_EVENT_COL_START,
		end: FEED_EVENT_COL_END,
		style: opColor ? chalk.hex(opColor) : base,
	});

	// After EVENT: actor + summary (may have dim portion and glyph)
	const afterEventEnd = glyphPos ?? line.length;
	const actorStyle_ =
		isLifecycleRow || isToolOk
			? rowBase
			: opts.duplicateActor
				? chalk.dim.hex(theme.textMuted)
				: base;

	// Actor segment (EVENT_COL_END..ACTOR_COL_END)
	const actorEnd = Math.min(FEED_ACTOR_COL_END, afterEventEnd);
	if (actorEnd > FEED_EVENT_COL_END) {
		segments.push({
			start: FEED_EVENT_COL_END,
			end: actorEnd,
			style: actorStyle_,
		});
	}

	// Summary segment (ACTOR_COL_END..end), with optional dim portion.
	// When dimPos is set and falls within the summary range, split into
	// bright prefix + dim/warning suffix. Otherwise render as a single span.
	const summaryStart = actorEnd;
	const effectiveDim =
		dimPos !== undefined && dimPos < afterEventEnd
			? Math.max(dimPos, summaryStart)
			: undefined;

	if (effectiveDim !== undefined) {
		if (effectiveDim > summaryStart) {
			segments.push({
				start: summaryStart,
				end: effectiveDim,
				style: summaryBase,
			});
		}
		// Dim portion — use explicit muted color (dim SGR is unreliable with truecolor)
		const dimStyle = opts.outcomeZero
			? chalk.hex(theme.status.warning)
			: chalk.hex(theme.textMuted);
		segments.push({start: effectiveDim, end: afterEventEnd, style: dimStyle});
	} else if (summaryStart < afterEventEnd) {
		segments.push({start: summaryStart, end: afterEventEnd, style: summaryBase});
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
