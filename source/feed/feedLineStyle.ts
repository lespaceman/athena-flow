import chalk, {type ChalkInstance} from 'chalk';
import {type Theme} from '../theme/types.js';
import {GLYPH_REGISTRY, getGlyphs} from '../glyphs/index.js';
import {
	type SummarySegmentRole,
	type ResolvedSegment,
	FEED_EVENT_COL_START,
	FEED_EVENT_COL_END,
	FEED_ACTOR_COL_END,
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
	/** Structured summary segments with resolved absolute positions. */
	summarySegments?: ResolvedSegment[];
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

	// Full-row dimming: lifecycle events get muted base for all segments
	// (Tool OK only dims the EVENT column via opCategoryColor, not the whole row)
	const isLifecycleRow =
		opts.opTag !== undefined && /^(run\.|sess\.|stop\.|sub\.)/.test(opts.opTag);
	const rowBase =
		!isError && isLifecycleRow ? chalk.hex(theme.textMuted) : base;

	// TIME column is always muted — it's reference info, not scannable
	const timeStyle = isError
		? chalk.hex(theme.status.error)
		: chalk.hex(theme.textMuted);

	// Agent messages: summary text uses info color (blue)
	const isAgentMsg = opts.opTag === 'agent.msg';
	const summaryBase = isAgentMsg ? chalk.hex(theme.status.info) : rowBase;

	// Determine if EVENT segment gets separate coloring
	const opColor =
		opts.opTag && !isError ? opCategoryColor(opts.opTag, theme) : undefined;

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
		gutterStyle = timeStyle;
	}

	// Build styled string by painting segments
	let styled = gutterStyle(gutterChar);
	const segments: {start: number; end: number; style: ChalkInstance}[] = [];

	// TIME segment (1..EVENT_START) — always muted per palette
	segments.push({start: 1, end: FEED_EVENT_COL_START, style: timeStyle});
	// EVENT segment (colored by category)
	segments.push({
		start: FEED_EVENT_COL_START,
		end: FEED_EVENT_COL_END,
		style: opColor ? chalk.hex(opColor) : base,
	});

	// After EVENT: actor + summary (may have structured segments and glyph)
	const afterEventEnd = glyphPos ?? line.length;
	const actorStyle_ = isLifecycleRow
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

	// Summary segment — use structured segments when available, else single span.
	const summaryStart = actorEnd;
	const resolvedSegs = opts.summarySegments;
	if (resolvedSegs && resolvedSegs.length > 0) {
		// Style function for each role
		const roleStyle = (role: SummarySegmentRole): ChalkInstance => {
			if (isError) return chalk.hex(theme.status.error);
			switch (role) {
				case 'verb':
					return summaryBase;
				case 'target':
					return chalk.hex(theme.textMuted);
				case 'outcome':
					return opts.outcomeZero
						? chalk.hex(theme.status.warning)
						: chalk.hex(theme.textMuted);
				case 'plain':
					return summaryBase;
			}
		};
		// Fill any gap before first segment
		let cursor = summaryStart;
		for (const seg of resolvedSegs) {
			const segStart = Math.max(seg.start, summaryStart);
			const segEnd = Math.min(seg.end, afterEventEnd);
			if (segEnd <= segStart) continue;
			// Gap fill between segments
			if (segStart > cursor) {
				segments.push({start: cursor, end: segStart, style: summaryBase});
			}
			segments.push({start: segStart, end: segEnd, style: roleStyle(seg.role)});
			cursor = segEnd;
		}
		// Fill remaining summary space after last segment
		if (cursor < afterEventEnd) {
			segments.push({start: cursor, end: afterEventEnd, style: summaryBase});
		}
	} else if (summaryStart < afterEventEnd) {
		segments.push({
			start: summaryStart,
			end: afterEventEnd,
			style: summaryBase,
		});
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
