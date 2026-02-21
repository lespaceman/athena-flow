import chalk from 'chalk';
import stringWidth from 'string-width';
import type {HeaderModel} from './headerModel.js';

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
): [string] {
	const SEP = '   ';
	const athena = hasColor ? chalk.bold('ATHENA FLOW') : 'ATHENA FLOW';

	const wfLabel = hasColor ? chalk.dim('Workflow: ') : 'Workflow: ';
	const hLabel = hasColor ? chalk.dim('Harness: ') : 'Harness: ';

	// Context as plain text
	const usedK =
		model.context.used !== null
			? `${Math.round(model.context.used / 1000)}k`
			: '\u2014';
	const maxK = `${Math.round(model.context.max / 1000)}k`;
	const ctxLabel = hasColor ? chalk.dim('Ctx: ') : 'Ctx: ';
	const ctxText = `${ctxLabel}${usedK}/${maxK}`;

	// Truncated session ID
	const sid = truncateSessionId(model.session_id, 8);
	const sidLabel = hasColor ? chalk.dim('S: ') : 'S: ';
	const sidText = `${sidLabel}${sid}`;

	type Token = {text: string; priority: number};
	const tokens: Token[] = [
		{text: athena, priority: 100},
		{text: `${wfLabel}${model.workflow}`, priority: 70},
		{text: `${hLabel}${model.harness}`, priority: 60},
		{text: sidText, priority: 30},
		{text: ctxText, priority: 50},
	];

	function buildLine(ts: Token[]): string {
		return ts.map(t => t.text).join(SEP);
	}

	let current = [...tokens];
	const totalTarget = width - 1;

	while (current.length > 1 && visWidth(buildLine(current)) > totalTarget) {
		let minIdx = 1;
		let minPri = current[1]!.priority;
		for (let i = 2; i < current.length; i++) {
			if (current[i]!.priority < minPri) {
				minPri = current[i]!.priority;
				minIdx = i;
			}
		}
		current.splice(minIdx, 1);
	}

	const line = buildLine(current);
	const vw = visWidth(line);
	const padded = vw < totalTarget ? line + ' '.repeat(totalTarget - vw) : line;
	return [padded];
}
