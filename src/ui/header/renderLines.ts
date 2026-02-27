import chalk from 'chalk';
import stringWidth from 'string-width';
import type {HeaderModel} from './model';
import {renderContextBar} from './contextBar';

export function truncateSessionId(id: string, maxWidth: number): string {
	if (id.length <= maxWidth) return id;
	if (maxWidth >= 12) {
		const tail = id.slice(-6);
		return id.slice(0, maxWidth - 7) + '\u2026' + tail;
	}
	const alphanumeric = id.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
	return 'S' + (alphanumeric || '\u2013');
}

export function renderHeaderLines(
	model: HeaderModel,
	width: number,
	hasColor: boolean,
): [string] {
	const SEP = '   ';
	const athena = hasColor ? chalk.bold('ATHENA FLOW') : 'ATHENA FLOW';

	const wfLabel = hasColor ? chalk.dim('Workflow: ') : 'Workflow: ';
	const hLabel = hasColor ? chalk.dim('Harness: ') : 'Harness: ';

	// Context bar (visual progress)
	const ctxBarWidth = 20;
	const ctxText = renderContextBar(
		model.context.used,
		model.context.max,
		ctxBarWidth,
		hasColor,
	);

	// Truncated session ID
	const sid = truncateSessionId(model.session_id, 8);
	const sidLabel = hasColor ? chalk.dim('S: ') : 'S: ';
	const sidScope =
		model.session_total > 0
			? ` (${model.session_index ?? model.session_total}/${model.session_total})`
			: '';
	const sidText = `${sidLabel}${sid}${sidScope}`;

	type Token = {text: string; priority: number};
	const tokens: Token[] = [
		{text: athena, priority: 100},
		{text: sidText, priority: 90},
		{text: `${wfLabel}${model.workflow}`, priority: 70},
		{text: `${hLabel}${model.harness}`, priority: 60},
		{text: ctxText, priority: 50},
	];

	function buildLine(ts: Token[]): string {
		return ts.map(t => t.text).join(SEP);
	}

	const current = [...tokens];
	const totalTarget = width - 1;

	while (current.length > 1 && stringWidth(buildLine(current)) > totalTarget) {
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
	const vw = stringWidth(line);
	const padded = vw < totalTarget ? line + ' '.repeat(totalTarget - vw) : line;
	return [padded];
}
