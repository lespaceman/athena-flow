import chalk, {type ChalkInstance} from 'chalk';
import sliceAnsi from 'slice-ansi';
import {type Theme} from '../theme/types.js';
import {GLYPH_REGISTRY, getGlyphs} from '../glyphs/index.js';
import {
	FEED_OP_COL_START,
	FEED_OP_COL_END,
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
	op?: string;
	/** Char offset within summary where dim styling should begin. */
	summaryDimStart?: number;
	/** True when this line starts a new event category group. */
	categoryBreak?: boolean;
};

function opCategoryColor(op: string, theme: Theme): string | undefined {
	if (op === 'tool.ok') return theme.status.success;
	if (op === 'tool.fail') return theme.status.error;
	if (op.startsWith('tool.')) return theme.status.warning;
	if (op.startsWith('perm.')) return theme.accentSecondary;
	if (op === 'agent.msg') return theme.status.info;
	if (op.startsWith('run.') || op.startsWith('sess.') || op.startsWith('stop.'))
		return theme.textMuted;
	return undefined;
}

function actorStyle(actorId: string, theme: Theme): ChalkInstance {
	if (actorId === 'system') return chalk.dim.hex(theme.textMuted);
	if (actorId === 'user') return chalk.hex(theme.userMessage.text);
	if (actorId.startsWith('subagent:')) return chalk.hex(theme.accentSecondary);
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

	// Determine if OP segment gets separate coloring
	const opColor =
		opts.op && !isError ? opCategoryColor(opts.op, theme) : undefined;

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

	// Build styled string by painting segments
	let styled = '';
	const segments: {start: number; end: number; style: ChalkInstance}[] = [];

	// TIME segment (0..OP_START)
	segments.push({start: 0, end: FEED_OP_COL_START, style: base});
	// OP segment
	segments.push({
		start: FEED_OP_COL_START,
		end: FEED_OP_COL_END,
		style: opColor ? chalk.hex(opColor) : base,
	});

	// After OP: actor + summary (may have dim portion and glyph)
	const afterOpEnd = glyphPos ?? line.length;
	if (dimPos !== undefined && dimPos < afterOpEnd) {
		// Non-dim portion after OP
		segments.push({start: FEED_OP_COL_END, end: dimPos, style: base});
		// Dim portion — use explicit muted color (dim SGR is unreliable with truecolor)
		segments.push({
			start: dimPos,
			end: afterOpEnd,
			style: chalk.hex(theme.textMuted),
		});
	} else {
		segments.push({start: FEED_OP_COL_END, end: afterOpEnd, style: base});
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

	// Search match: prepend accent ▌ (replacing first char)
	if (matched) {
		styled =
			chalk.hex(theme.accent)(getGlyphs(ascii)['feed.searchMatch']) +
			sliceAnsi(styled, 1);
	}

	// Category break: prepend dim dot (replacing first char) for visual grouping.
	// Skip for prompt ops — user border takes precedence over category break.
	if (opts.categoryBreak && !matched && opts.op !== 'prompt') {
		const breakGlyph = chalk.dim.hex(theme.textMuted)('·');
		styled = breakGlyph + sliceAnsi(styled, 1);
	}

	// User prompt: accent left-border (replacing first char)
	if (opts.op === 'prompt' && !matched) {
		const g = getGlyphs(ascii);
		const borderColor = theme.userMessage.border ?? theme.accent;
		const borderGlyph = chalk.hex(borderColor)(g['feed.userBorder']);
		styled = borderGlyph + sliceAnsi(styled, 1);
	}

	return styled;
}
