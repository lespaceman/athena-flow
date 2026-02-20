import chalk from 'chalk';
import stringWidth from 'string-width';
import type {HeaderModel, HeaderStatus} from './headerModel.js';
import {getStatusBadge} from './statusBadge.js';
import {renderContextBar} from './contextBar.js';

function visWidth(s: string): number {
	return stringWidth(s);
}

function truncateStr(s: string, max: number): string {
	if (max <= 0) return '';
	if (s.length <= max) return s;
	if (max <= 1) return s.slice(0, max);
	return s.slice(0, max - 1) + '\u2026';
}

export function truncateSessionId(id: string, maxWidth: number): string {
	if (id.length <= maxWidth) return id;
	if (maxWidth >= 12) {
		const tail = id.slice(-6);
		return id.slice(0, maxWidth - 7) + '\u2026' + tail;
	}
	const alphanumeric = id.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
	return 'S' + (alphanumeric || '\u2013');
}

/** Compute the maximum badge width across all statuses for rail stability. */
function maxBadgeWidth(hasColor: boolean): number {
	const statuses: HeaderStatus[] = ['active', 'idle', 'error', 'stopped'];
	let max = 0;
	for (const s of statuses) {
		const w = visWidth(getStatusBadge(s, hasColor));
		if (w > max) max = w;
	}
	return max;
}

function padLine(
	left: string,
	right: string,
	width: number,
	hasColor: boolean,
): string {
	const measure = (s: string) => (hasColor ? visWidth(s) : s.length);
	let lw = measure(left);
	const rw = measure(right);
	const totalTarget = width - 1;

	// If left + right + min gap exceeds target, truncate left
	let truncatedLeft = left;
	if (lw + rw + 1 > totalTarget) {
		const maxLW = Math.max(0, totalTarget - rw - 1);
		truncatedLeft = truncateStr(toPlainText(left, hasColor), maxLW);
		lw = truncatedLeft.length;
	}

	const gap = Math.max(1, totalTarget - lw - rw);
	return truncatedLeft + ' '.repeat(gap) + right;
}

/** Strip ANSI escape codes so truncation doesn't break mid-sequence. */
function toPlainText(s: string, hasColor: boolean): string {
	if (!hasColor) return s;
	return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export function renderHeaderLines(
	model: HeaderModel,
	width: number,
	hasColor: boolean,
	_now?: number,
): [string, string] {
	const maxBW = maxBadgeWidth(hasColor);
	const SEP = '   '; // triple space separator

	// ── Line 1 right: status badge only ──
	const badge = getStatusBadge(model.status, hasColor, model.error_reason);
	const badgeVW = visWidth(badge);
	const badgePadded = badge + ' '.repeat(Math.max(0, maxBW - badgeVW));
	const rightRail1 = badgePadded;

	// ── Line 1 left: ATHENA   Workflow: <val>   Harness: <val> ──
	const athena = hasColor ? chalk.bold('ATHENA') : 'ATHENA';

	type Token = {text: string; priority: number};
	const leftTokens: Token[] = [{text: athena, priority: 100}];

	const wfLabel = hasColor ? chalk.dim('Workflow: ') : 'Workflow: ';
	leftTokens.push({text: `${wfLabel}${model.workflow}`, priority: 70});

	const hLabel = hasColor ? chalk.dim('Harness: ') : 'Harness: ';
	leftTokens.push({text: `${hLabel}${model.harness}`, priority: 50});

	const railWidth = visWidth(rightRail1);
	const maxLeft = width - 1 - railWidth - 1;

	function buildLeft(tokens: Token[]): string {
		return tokens.map(t => t.text).join(SEP);
	}

	let currentTokens = [...leftTokens];

	// Drop tokens by priority (lowest first) until it fits
	while (
		currentTokens.length > 1 &&
		visWidth(buildLeft(currentTokens)) > maxLeft
	) {
		let minIdx = 1;
		let minPri = currentTokens[1]!.priority;
		for (let i = 2; i < currentTokens.length; i++) {
			if (currentTokens[i]!.priority < minPri) {
				minPri = currentTokens[i]!.priority;
				minIdx = i;
			}
		}
		currentTokens.splice(minIdx, 1);
	}

	const leftStr1 = buildLeft(currentTokens);
	const line1 = padLine(leftStr1, rightRail1, width, hasColor);

	// ── Line 2: Session ID: <val>   Context <used>/<max> <bar> ──
	const sidLabel = hasColor ? chalk.dim('Session ID: ') : 'Session ID: ';
	const sidText = `${sidLabel}${model.session_id}`;

	// Context bar fills remaining width
	const sidVW = visWidth(sidText);
	const minCtxWidth = 20;
	const ctxAvail = Math.max(minCtxWidth, width - 1 - sidVW - SEP.length);
	const ctxBar = renderContextBar(
		model.context.used,
		model.context.max,
		ctxAvail,
		hasColor,
	);

	const leftStr2 = `${sidText}${SEP}${ctxBar}`;

	// Truncate if line 2 overflows
	const l2vw = visWidth(leftStr2);
	let line2: string;
	if (l2vw <= width - 1) {
		line2 = leftStr2 + ' '.repeat(Math.max(0, width - 1 - l2vw));
	} else {
		// Drop session ID, just show context bar
		const ctxOnly = renderContextBar(
			model.context.used,
			model.context.max,
			Math.max(minCtxWidth, width - 1),
			hasColor,
		);
		const cvw = visWidth(ctxOnly);
		line2 = ctxOnly + ' '.repeat(Math.max(0, width - 1 - cvw));
	}

	return [line1, line2];
}
