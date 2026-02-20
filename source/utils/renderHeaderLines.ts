import chalk from 'chalk';
import stringWidth from 'string-width';
import type {HeaderModel, HeaderStatus} from './headerModel.js';
import {getStatusBadge} from './statusBadge.js';
import {formatClock} from './format.js';
import {formatDuration} from './formatters.js';

function visWidth(s: string): number {
	return stringWidth(s);
}

function truncateStr(s: string, max: number): string {
	if (max <= 0) return '';
	if (s.length <= max) return s;
	if (max <= 1) return s.slice(0, max);
	return s.slice(0, max - 1) + '\u2026';
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
	const clock = shortClock ? clockStr.slice(0, 5) : clockStr; // HH:MM or HH:MM:SS

	// Right rail line 1: badge (padded to maxBW) + space + clock
	const badge = getStatusBadge(model.status, hasColor);
	const badgeVW = visWidth(badge);
	const badgePadded = badge + ' '.repeat(maxBW - badgeVW);
	const rightRail1 = badgePadded + ' ' + clock;

	// Build left tokens for line 1
	const athena = hasColor ? chalk.bold('ATHENA') : 'ATHENA';

	type Token = {text: string; priority: number}; // lower priority = dropped first
	const leftTokens: Token[] = [{text: athena, priority: 100}];

	// Title token (workflow_ref takes precedence over run_title)
	if (model.workflow_ref) {
		const label = hasColor ? chalk.dim('workflow:') : 'workflow:';
		const value = model.workflow_ref;
		leftTokens.push({text: `${label} ${value}`, priority: 50});
	} else if (model.run_title) {
		const label = hasColor ? chalk.dim('run:') : 'run:';
		const value = model.run_title;
		leftTokens.push({text: `${label} ${value}`, priority: 50});
	}

	// Run ID
	if (model.run_id_short) {
		leftTokens.push({
			text: `run ${model.run_id_short}`,
			priority: 20,
		});
	}

	// Engine
	if (model.engine) {
		leftTokens.push({text: model.engine, priority: 10});
	}

	const sep = ' \u00B7 '; // " · "
	const railWidth = visWidth(rightRail1);
	const maxLeft = width - 1 - railWidth - 1; // 1 for min gap

	// Truncation: iteratively drop lowest priority tokens, then truncate title
	function buildLeft(tokens: Token[]): string {
		return tokens.map(t => t.text).join(sep);
	}

	let currentTokens = [...leftTokens];

	// Drop tokens by priority (lowest first) until it fits
	while (
		currentTokens.length > 1 &&
		visWidth(buildLeft(currentTokens)) > maxLeft
	) {
		// Find lowest priority token (skip index 0 which is ATHENA)
		let minIdx = 1;
		let minPri = currentTokens[1]!.priority;
		for (let i = 2; i < currentTokens.length; i++) {
			if (currentTokens[i]!.priority < minPri) {
				minPri = currentTokens[i]!.priority;
				minIdx = i;
			}
		}
		// If lowest is the title token (priority 50) and there are lower ones, drop those first
		currentTokens.splice(minIdx, 1);
	}

	// If still too wide, truncate the title value in the second token
	if (
		currentTokens.length > 1 &&
		visWidth(buildLeft(currentTokens)) > maxLeft
	) {
		const titleToken = currentTokens[1]!;
		const overhead = visWidth(currentTokens[0]!.text) + visWidth(sep) + 1; // +1 for safety
		const availForTitle = maxLeft - overhead;
		if (availForTitle > 0) {
			// Truncate just the value part
			const colonIdx = titleToken.text.indexOf(' ');
			if (colonIdx >= 0) {
				const labelPart = titleToken.text.slice(0, colonIdx + 1); // "workflow: " or "run: "
				const valuePart = titleToken.text.slice(colonIdx + 1);
				const labelW = visWidth(labelPart);
				const maxValW = availForTitle - labelW;
				if (maxValW > 0) {
					titleToken.text = labelPart + truncateStr(valuePart, maxValW);
				} else {
					titleToken.text = truncateStr(titleToken.text, availForTitle);
				}
			} else {
				titleToken.text = truncateStr(titleToken.text, availForTitle);
			}
		} else {
			// Drop the title entirely
			currentTokens.splice(1, 1);
		}
	}

	const leftStr1 = buildLeft(currentTokens);
	const line1 = padLine(leftStr1, rightRail1, width, hasColor);

	// Line 2
	const leftParts2: string[] = [];
	if (model.progress) {
		leftParts2.push(`progress: ${model.progress.done}/${model.progress.total}`);
	}
	if (model.elapsed_ms !== undefined) {
		leftParts2.push(`elapsed ${formatDuration(model.elapsed_ms / 1000)}`);
	}
	if (model.ended_at !== undefined) {
		leftParts2.push(`ended ${formatClock(model.ended_at)}`);
	}
	const leftStr2 = leftParts2.join(sep);

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

	const line2 =
		leftStr2 || rightStr2
			? padLine(leftStr2, rightStr2, width, hasColor)
			: ' '.repeat(width - 1);

	return [line1, line2];
}
