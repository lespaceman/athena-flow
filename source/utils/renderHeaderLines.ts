import chalk from 'chalk';
import stringWidth from 'string-width';
import type {HeaderModel, HeaderStatus} from './headerModel.js';
import {getStatusBadge} from './statusBadge.js';
import {formatClock} from './format.js';
import {formatDuration} from './formatters.js';
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
	const statuses: HeaderStatus[] = [
		'running',
		'succeeded',
		'failed',
		'stopped',
		'idle',
	];
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
	now?: number,
): [string, string] {
	const maxBW = maxBadgeWidth(hasColor);
	const shortClock = width < 70;
	const clockStr = formatClock(now ?? Date.now());
	const clock = shortClock ? clockStr.slice(0, 5) : clockStr;

	// Right rail line 1: badge (padded to maxBW) + space + clock
	const badge = getStatusBadge(model.status, hasColor);
	const badgeVW = visWidth(badge);
	const badgePadded = badge + ' '.repeat(maxBW - badgeVW);
	const rightRail1 = badgePadded + ' ' + clock;

	// Build left tokens for line 1
	const athena = hasColor ? chalk.bold('ATHENA') : 'ATHENA';

	type Token = {text: string; priority: number};
	const leftTokens: Token[] = [{text: athena, priority: 100}];

	// Session ID (priority 70)
	leftTokens.push({text: model.session_id, priority: 70});

	// Workflow (priority 60)
	leftTokens.push({text: `wf:${model.workflow}`, priority: 60});

	// Harness (priority 40)
	leftTokens.push({text: `harness:${model.harness}`, priority: 40});

	const sep = ' \u00B7 '; // " · "
	const railWidth = visWidth(rightRail1);
	const maxLeft = width - 1 - railWidth - 1;

	function buildLeft(tokens: Token[]): string {
		return tokens.map(t => t.text).join(sep);
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

	// If still too wide after dropping, truncate session ID (the token with priority 70)
	if (
		currentTokens.length > 1 &&
		visWidth(buildLeft(currentTokens)) > maxLeft
	) {
		const sessIdx = currentTokens.findIndex(t => t.priority === 70);
		if (sessIdx >= 0) {
			const sessToken = currentTokens[sessIdx]!;
			const otherWidth =
				visWidth(buildLeft(currentTokens)) - visWidth(sessToken.text);
			const availForSess = maxLeft - otherWidth;
			if (availForSess > 5) {
				sessToken.text = truncateSessionId(sessToken.text, availForSess);
			} else {
				currentTokens.splice(sessIdx, 1);
			}
		}
	}

	const leftStr1 = buildLeft(currentTokens);
	const line1 = padLine(leftStr1, rightRail1, width, hasColor);

	// Line 2
	const sep2 = ' \u00B7 ';
	const leftParts2: string[] = [];

	// Context bar — allocate ~20 chars for the bar
	const ctxBarWidth = 20;
	leftParts2.push(
		renderContextBar(
			model.context.used,
			model.context.max,
			ctxBarWidth,
			hasColor,
		),
	);

	// Runs count
	leftParts2.push(`runs:${model.run_count}`);

	if (model.progress) {
		leftParts2.push(`progress: ${model.progress.done}/${model.progress.total}`);
	}
	if (model.elapsed_ms !== undefined) {
		leftParts2.push(`elapsed ${formatDuration(model.elapsed_ms / 1000)}`);
	}
	if (model.ended_at !== undefined) {
		leftParts2.push(`ended ${formatClock(model.ended_at)}`);
	}
	const leftStr2 = leftParts2.join(sep2);

	// Right rail line 2: err/blk
	const rightParts2: string[] = [];
	if (model.err_count > 0) {
		const errText = `err ${model.err_count}`;
		rightParts2.push(hasColor ? chalk.red(errText) : errText);
	}
	if (model.block_count > 0) {
		const blkText = `blk ${model.block_count}`;
		rightParts2.push(hasColor ? chalk.yellow(blkText) : blkText);
	}
	const rightStr2 = rightParts2.join(' ');

	const line2 = padLine(leftStr2, rightStr2, width, hasColor);

	return [line1, line2];
}
