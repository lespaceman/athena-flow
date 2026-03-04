import chalk from 'chalk';
import {type Theme} from '../../ui/theme/types';
import {fit as fitImpl, formatClock} from '../../shared/utils/format';
import {getGlyphs} from '../../ui/glyphs/index';
import stripAnsi from 'strip-ansi';

// Re-export fit so all formatter consumers import from one place
export {fit} from '../../shared/utils/format';

export function opCategoryColor(op: string, theme: Theme): string | undefined {
	if (op === 'tool.fail') return theme.status.error;
	if (op === 'tool.ok') return theme.textMuted;
	if (op.startsWith('tool.')) return theme.textMuted;
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

type ToolPalette = {
	dot: string;
	bg: string;
	fg: string;
};

type BuiltInSubagentType = 'explore' | 'plan' | 'general-purpose' | 'bash';

export type ToolPillCategory =
	| 'safe'
	| 'mutating'
	| 'neutral'
	| 'skill'
	| 'subagent';

const TOOL_PILL_PALETTES: Record<
	Exclude<ToolPillCategory, 'subagent'>,
	ToolPalette
> = {
	safe: {
		dot: '#38bdf8',
		bg: '#102a42',
		fg: '#7dd3fc',
	},
	mutating: {
		dot: '#f59e0b',
		bg: '#3a2508',
		fg: '#fbbf24',
	},
	neutral: {
		dot: '#6b7280',
		bg: '#1b2533',
		fg: '#9ca3af',
	},
	skill: {
		dot: '#f472b6',
		bg: '#3d1229',
		fg: '#f9a8d4',
	},
};

const SUBAGENT_PILL_PALETTES: Record<BuiltInSubagentType, ToolPalette> = {
	explore: {
		dot: '#22d3ee',
		bg: '#0b2a36',
		fg: '#67e8f9',
	},
	plan: {
		dot: '#a78bfa',
		bg: '#2a1452',
		fg: '#c4b5fd',
	},
	'general-purpose': {
		dot: '#34d399',
		bg: '#0a4637',
		fg: '#6ee7b7',
	},
	bash: {
		dot: '#fb923c',
		bg: '#3b1809',
		fg: '#fdba74',
	},
};

const FALLBACK_SUBAGENT_PILL: ToolPalette = {
	dot: '#93c5fd',
	bg: '#1a3252',
	fg: '#bfdbfe',
};

const NON_DESTRUCTIVE_TOOL_LABELS = new Set([
	'Read',
	'Grep',
	'Glob',
	'WebFetch',
	'WebSearch',
	'Find',
	'Inspect',
	'Screenshot',
	'Snapshot',
	'FormScan',
	'FieldCtx',
	'ListPages',
	'Ping',
	'Resolve',
	'QueryDocs',
	'Navigate',
	'Reload',
	'Back',
	'Forward',
	'AskUser',
	'Task',
	'TaskOut',
]);

const MUTATING_TOOL_LABELS = new Set([
	'Write',
	'Edit',
	'Notebook',
	'Bash',
	'TodoWrite',
	'TaskStop',
	'PlanMode',
	'Worktree',
	'Click',
	'Type',
	'Press',
	'Select',
	'Hover',
	'Scroll',
	'ScrollTo',
	'Close',
	'ClosePage',
]);

export function resolveToolPillCategoryForLabel(
	label: string,
): Exclude<ToolPillCategory, 'subagent'> {
	if (label === 'Skill') return 'skill';
	if (MUTATING_TOOL_LABELS.has(label)) return 'mutating';
	if (NON_DESTRUCTIVE_TOOL_LABELS.has(label)) return 'safe';
	return 'neutral';
}

function normalizeSubagentType(type: string | undefined): string {
	if (!type) return '';
	return type
		.trim()
		.toLowerCase()
		.replace(/[_\s]+/g, '-');
}

function resolvePillPalette(
	category: ToolPillCategory,
	subagentType?: string,
): ToolPalette {
	if (category === 'subagent') {
		const normalized = normalizeSubagentType(subagentType);
		if (normalized in SUBAGENT_PILL_PALETTES) {
			return SUBAGENT_PILL_PALETTES[normalized as BuiltInSubagentType];
		}
		return FALLBACK_SUBAGENT_PILL;
	}
	return TOOL_PILL_PALETTES[category];
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
		return chalk.hex(theme.userMessage.border)(g['feed.userBorder']);
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
	_actorId: string,
): string {
	if (contentWidth <= 0) return '';
	if (duplicate) {
		// Left-aligned dot matching fit('·', width) behavior in old path
		const text = fitImpl('\u00B7', contentWidth);
		return chalk.hex(theme.textMuted)(text);
	}
	return chalk.hex(theme.textMuted)(fitImpl(actor, contentWidth));
}

export function formatTool(
	toolColumn: string,
	contentWidth: number,
	theme: Theme,
	options?: {
		pill?: boolean;
		category?: ToolPillCategory;
		subagentType?: string;
		ascii?: boolean;
	},
): string {
	if (contentWidth <= 0) return '';
	if (!toolColumn) return fitImpl('', contentWidth);

	if (!options || options.pill !== true) {
		return chalk.hex(theme.textMuted)(fitImpl(toolColumn, contentWidth));
	}

	const category = options.category ?? 'neutral';
	const palette = resolvePillPalette(category, options.subagentType);
	if (contentWidth < 8) {
		return chalk.hex(palette.dot)(fitImpl(toolColumn, contentWidth));
	}

	// Fixed-width pill without bracket caps. Keep plain trailing padding so
	// adjacent rows don't visually fuse into a single vertical block.
	const maxLabelWidth = Math.max(1, contentWidth - 7); // keep at least 2 plain cols
	const fitted = fitImpl(toolColumn, maxLabelWidth).trimEnd();
	const pillLabel = fitted;
	const visiblePillWidth = 5 + pillLabel.length; // left gap + dot+spacer + padded pill
	const trailingPad = ' '.repeat(Math.max(0, contentWidth - visiblePillWidth));
	const toolGlyphs = getGlyphs(options.ascii ?? false);
	const dot = chalk.hex(palette.dot)(toolGlyphs['tool.bullet']);
	const pill = chalk.bgHex(palette.bg).hex(palette.fg)(` ${pillLabel} `);
	return ` ${dot} ${pill}${trailingPad}`;
}

export function formatResult(
	outcome: string | undefined,
	outcomeZero: boolean | undefined,
	contentWidth: number,
	theme: Theme,
): string {
	if (contentWidth <= 0) return '';
	if (!outcome) return fitImpl('', contentWidth);

	const label = outcome.trim();
	const badgeLen = label.length + 2; // surrounding spaces
	if (badgeLen <= contentWidth) {
		const badge = outcomeZero
			? chalk.bgHex('#4a3a0c').hex('#fde047')(` ${label} `)
			: chalk.bgHex('#10321d').hex('#3fb950')(` ${label} `);
		return badge + ' '.repeat(contentWidth - badgeLen);
	}

	const fitted = fitImpl(label, contentWidth);
	if (outcomeZero) return chalk.hex(theme.status.warning)(fitted);
	return chalk.hex(theme.status.success)(fitted);
}

export function formatSuffix(
	expandable: boolean,
	_expanded: boolean,
	_ascii: boolean,
	_theme: Theme,
): string {
	if (!expandable) return '  ';
	return '  ';
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

import type {SummarySegment, SummarySegmentRole} from './timeline';

function renderSegments(
	segments: SummarySegment[],
	summary: string,
	width: number,
	theme: Theme,
	opTag: string,
	isError: boolean,
): string {
	if (width <= 0) return '';
	const normalizePathPrefix = (text: string): string =>
		text.replace(/(^|\s)(?:\u2026\/|\.{3}\/)/g, '$1/');
	if (segments.length === 0) {
		return fitImpl(normalizePathPrefix(summary), width);
	}

	const isAgentMsg = opTag === 'agent.msg';
	const baseColor = isAgentMsg ? theme.status.info : theme.text;
	const hasFilename = segments.some(seg => seg.role === 'filename');

	const roleColor = (role: SummarySegmentRole): string => {
		if (isError) return theme.status.error;
		switch (role) {
			case 'verb':
				return baseColor;
			case 'target':
				return hasFilename ? theme.textMuted : baseColor;
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
		const normalizedText = normalizePathPrefix(seg.text);
		const text =
			normalizedText.length > remaining
				? normalizedText.slice(0, remaining)
				: normalizedText;
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
