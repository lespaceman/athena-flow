import chalk from 'chalk';
import {progressGlyphs} from '../glyphs/index.js';

export function formatTokenCount(value: number | null): string {
	if (value === null) return '0';
	if (value < 1000) return String(value);
	const k = value / 1000;
	if (Number.isInteger(k)) return `${k}k`;
	return `${parseFloat(k.toFixed(1))}k`;
}

export function renderContextBar(
	used: number | null,
	max: number,
	width: number,
	hasColor: boolean,
): string {
	const usedStr = formatTokenCount(used);
	const maxStr = formatTokenCount(max);
	const label = 'Context ';
	const numbers = ` ${usedStr}/${maxStr}`;

	const bracketOverhead = hasColor ? 0 : 2;
	const barWidth = Math.max(
		6,
		width - label.length - numbers.length - bracketOverhead,
	);

	const ratio = used !== null ? Math.min(1, Math.max(0, used / max)) : 0;
	const filled = Math.round(ratio * barWidth);
	const empty = barWidth - filled;

	let bar: string;
	if (hasColor) {
		const pg = progressGlyphs();
		const filledStr = pg.filled.repeat(filled);
		const emptyStr = pg.empty.repeat(empty);
		const pct = used !== null ? used / max : 0;
		const colorFn =
			pct > 0.9 ? chalk.red : pct > 0.7 ? chalk.yellow : chalk.green;
		bar = colorFn(filledStr) + chalk.dim(emptyStr);
	} else {
		const pg = progressGlyphs(true);
		const filledStr = pg.filled.repeat(filled);
		const emptyStr = pg.empty.repeat(empty);
		bar = `[${filledStr}${emptyStr}]`;
	}

	if (hasColor) {
		return `${chalk.dim(label)}${bar}${numbers}`;
	}
	return `${label}${bar}${numbers}`;
}
