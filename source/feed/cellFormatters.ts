import chalk from 'chalk';
import {type Theme} from '../theme/types.js';
import {fit as fitImpl, formatClock} from '../utils/format.js';
import {getGlyphs} from '../glyphs/index.js';
import stripAnsi from 'strip-ansi';

// Re-export fit so all formatter consumers import from one place
export {fit} from '../utils/format.js';

export function opCategoryColor(op: string, theme: Theme): string | undefined {
	if (op === 'tool.fail') return theme.status.error;
	if (op === 'tool.ok' || op.startsWith('tool.')) return theme.textMuted;
	if (op.startsWith('perm.')) return theme.accentSecondary;
	if (op === 'agent.msg') return theme.textMuted;
	if (
		op.startsWith('run.') ||
		op.startsWith('sess.') ||
		op.startsWith('stop.') ||
		op.startsWith('sub.')
	)
		return theme.textMuted;
	return undefined;
}

export type FormatGutterOpts = {
	focused: boolean;
	matched: boolean;
	isUserBorder: boolean;
	ascii: boolean;
	theme: Theme;
};

export function formatGutter(opts: FormatGutterOpts): string {
	const {focused, matched, isUserBorder, ascii, theme} = opts;
	const g = getGlyphs(ascii);

	if (focused) {
		return chalk.hex(theme.accent)(g['feed.focusBorder']);
	}
	if (matched) {
		return chalk.hex(theme.accent)(g['feed.searchMatch']);
	}
	if (isUserBorder) {
		const borderColor = theme.userMessage.border ?? theme.accent;
		return chalk.hex(borderColor)(g['feed.userBorder']);
	}
	return ' ';
}

export function formatTime(
	ts: number,
	contentWidth: number,
	theme: Theme,
): string {
	const clock = formatClock(ts);
	return chalk.hex(theme.textMuted)(fitImpl(clock, contentWidth));
}

export function formatEvent(
	opLabel: string,
	contentWidth: number,
	theme: Theme,
	opTag?: string,
): string {
	const fitted = fitImpl(opLabel, contentWidth);
	const color = opTag ? opCategoryColor(opTag, theme) : undefined;
	return color ? chalk.hex(color)(fitted) : chalk.hex(theme.text)(fitted);
}

export function formatActor(
	actor: string,
	duplicate: boolean,
	contentWidth: number,
	theme: Theme,
	actorId: string,
): string {
	if (contentWidth <= 0) return '';
	if (duplicate) {
		// Left-aligned dot matching fit('·', width) behavior in old path
		const text = fitImpl('\u00B7', contentWidth);
		return chalk.dim.hex(theme.textMuted)(text);
	}
	const fitted = fitImpl(actor, contentWidth);
	if (actorId === 'system') return chalk.dim.hex(theme.textMuted)(fitted);
	if (actorId === 'user') return chalk.hex(theme.userMessage.text)(fitted);
	return chalk.hex(theme.text)(fitted);
}

export function formatTool(
	toolColumn: string,
	contentWidth: number,
	theme: Theme,
): string {
	if (contentWidth <= 0) return '';
	return chalk.hex(theme.text)(fitImpl(toolColumn, contentWidth));
}

export function formatSuffix(
	expandable: boolean,
	expanded: boolean,
	ascii: boolean,
	theme: Theme,
): string {
	if (!expandable) return '  ';
	const g = getGlyphs(ascii);
	if (expanded) {
		return ' ' + chalk.hex(theme.status.success)(g['feed.expandExpanded']);
	}
	return ' ' + chalk.hex(theme.accent)(g['feed.expandCollapsed']);
}

export function buildDetailsPrefix(
	mode: 'full' | 'compact' | 'narrow',
	toolColumn: string | undefined,
	actorStr: string | undefined,
	theme: Theme,
): {text: string; length: number} {
	if (mode === 'full') return {text: '', length: 0};

	let prefix = '';

	// Narrow: actor comes first
	if (mode === 'narrow' && actorStr) {
		prefix += chalk.hex(theme.textMuted)(fitImpl(actorStr, 10)) + ' ';
	}

	// Compact & narrow: tool as bright prefix
	if (toolColumn) {
		prefix += chalk.hex(theme.text)(toolColumn) + '  ';
	}

	if (!prefix) return {text: '', length: 0};
	return {text: prefix, length: stripAnsi(prefix).length};
}

export function layoutTargetAndOutcome(
	target: string,
	outcomeStr: string | undefined,
	width: number,
): string {
	if (width <= 0) return '';
	if (!outcomeStr) {
		return fitImpl(target, width);
	}

	const outcomeLen = outcomeStr.length;
	const targetBudget = width - outcomeLen - 2; // 2 = minimum gap

	// Not enough room to separate — inline fallback
	if (targetBudget < 10) {
		return fitImpl(`${target}  ${outcomeStr}`, width);
	}

	// Right-align outcome
	const fittedTarget = fitImpl(target, targetBudget);
	const padNeeded = width - fittedTarget.length - outcomeLen;
	const padding = padNeeded > 0 ? ' '.repeat(padNeeded) : '  ';
	return fittedTarget + padding + outcomeStr;
}

// ── Internal: render segments with role-based styling ────────

import type {SummarySegment, SummarySegmentRole} from './timeline.js';

function renderSegments(
	segments: SummarySegment[],
	summary: string,
	width: number,
	theme: Theme,
	opTag: string,
	isError: boolean,
): string {
	if (width <= 0) return '';
	if (segments.length === 0) {
		return fitImpl(summary, width);
	}

	const isAgentMsg = opTag === 'agent.msg';
	const baseColor = isAgentMsg ? theme.status.info : theme.text;

	const roleColor = (role: SummarySegmentRole): string => {
		if (isError) return theme.status.error;
		switch (role) {
			case 'verb':
				return baseColor;
			case 'target':
				return theme.textMuted;
			case 'filename':
				return theme.text;
			case 'outcome':
				return theme.textMuted;
			case 'plain':
				return baseColor;
		}
	};

	let result = '';
	let usedWidth = 0;
	for (const seg of segments) {
		if (usedWidth >= width) break;
		const remaining = width - usedWidth;
		const text =
			seg.text.length > remaining ? seg.text.slice(0, remaining) : seg.text;
		result += chalk.hex(roleColor(seg.role))(text);
		usedWidth += text.length;
	}

	// Pad to width
	if (usedWidth < width) {
		result += ' '.repeat(width - usedWidth);
	}
	return result;
}

// ── Internal: style outcome string ──────────────────────────

function renderOutcome(
	outcome: string | undefined,
	outcomeZero: boolean | undefined,
	theme: Theme,
): string | undefined {
	if (!outcome) return undefined;
	if (outcomeZero) return chalk.hex(theme.status.warning)(outcome);
	return chalk.hex(theme.textMuted)(outcome);
}

export type FormatDetailsOpts = {
	segments: SummarySegment[];
	summary: string;
	outcome?: string;
	outcomeZero?: boolean;
	mode: 'full' | 'compact' | 'narrow';
	toolColumn?: string;
	actorStr?: string;
	contentWidth: number;
	theme: Theme;
	opTag: string;
	isError?: boolean;
};

export function formatDetails(opts: FormatDetailsOpts): string {
	const {
		segments,
		summary,
		outcome,
		outcomeZero,
		mode,
		toolColumn,
		actorStr,
		contentWidth,
		theme,
		opTag,
		isError = false,
	} = opts;

	// Step 1: merged-column prefix
	const prefix = buildDetailsPrefix(mode, toolColumn, actorStr, theme);
	const innerWidth = Math.max(0, contentWidth - prefix.length);

	// Step 2: render outcome
	const outcomeStr = renderOutcome(outcome, outcomeZero, theme);
	const outcomeClean = outcomeStr ? stripAnsi(outcomeStr) : undefined;

	// Step 3: if no outcome, just render segments into innerWidth
	if (!outcomeStr || innerWidth <= 0) {
		return (
			prefix.text +
			renderSegments(segments, summary, innerWidth, theme, opTag, isError)
		);
	}

	// Step 4: lay out target + outcome with right-alignment
	const outcomeLen = outcomeClean!.length;
	const targetBudget = innerWidth - outcomeLen - 2;
	if (targetBudget < 10) {
		// Inline: segments + gap + outcome, all truncated
		const segStr = renderSegments(
			segments,
			summary,
			Math.max(0, innerWidth - outcomeLen - 2),
			theme,
			opTag,
			isError,
		);
		const segClean = stripAnsi(segStr).trimEnd();
		const padNeeded = innerWidth - segClean.length - outcomeLen;
		const pad = padNeeded >= 2 ? ' '.repeat(padNeeded) : '  ';
		const truncated = fitImpl(
			segClean + pad + stripAnsi(outcomeStr),
			innerWidth,
		);
		return prefix.text + truncated;
	}

	const segStr = renderSegments(
		segments,
		summary,
		targetBudget,
		theme,
		opTag,
		isError,
	);
	const segClean = stripAnsi(segStr);
	const padNeeded = innerWidth - segClean.length - outcomeLen;
	const pad = padNeeded > 0 ? ' '.repeat(padNeeded) : '  ';
	return prefix.text + segStr + pad + outcomeStr;
}
