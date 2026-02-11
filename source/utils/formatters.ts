import os from 'node:os';
import type {SessionStatsSnapshot} from '../types/headerMetrics.js';
import {type Theme} from '../theme/index.js';

/** Replace the home directory prefix with ~. */
export function shortenPath(fullPath: string): string {
	const home = os.homedir();
	if (fullPath.startsWith(home)) {
		return '~' + fullPath.slice(home.length);
	}
	return fullPath;
}

/** Format a token count for compact display (e.g. 53300 -> "53.3k"). */
export function formatTokens(n: number | null): string {
	if (n === null) return '--';
	if (n < 1000) return String(n);
	if (n < 1_000_000) {
		const k = n / 1000;
		if (k % 1 === 0) return `${k}k`;
		const formatted = k.toFixed(1);
		return formatted === '1000.0' ? '1m' : `${formatted}k`;
	}
	const m = n / 1_000_000;
	return m % 1 === 0 ? `${m}m` : `${m.toFixed(1)}m`;
}

/** Format elapsed seconds as a compact duration (e.g. 272 -> "4m32s"). */
export function formatDuration(seconds: number): string {
	if (seconds < 0) return '0s';
	const s = Math.floor(seconds);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const remainS = s % 60;
	if (m < 60) return remainS > 0 ? `${m}m${remainS}s` : `${m}m`;
	const h = Math.floor(m / 60);
	const remainM = m % 60;
	if (remainM === 0 && remainS === 0) return `${h}h`;
	if (remainS === 0) return `${h}h${remainM}m`;
	return `${h}h${remainM}m${remainS}s`;
}

const FILL_CHAR = '\u2588'; // █
const EMPTY_CHAR = '\u2591'; // ░

/** Render a text-based progress bar. */
export function formatProgressBar(
	percent: number | null,
	width: number = 12,
): string {
	if (percent === null) return '--';
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * width);
	return FILL_CHAR.repeat(filled) + EMPTY_CHAR.repeat(width - filled);
}

const MODEL_ALIASES = new Set(['opus', 'sonnet', 'haiku']);

/** Map a model ID to a short display name (e.g. "claude-opus-4-6" -> "Opus 4.6"). */
export function formatModelName(modelId: string | null): string {
	if (modelId === null) return '--';

	const match = modelId.match(/^claude-(\w+)-(\d+)-(\d+)(?:-\d{8})?$/);
	if (match) {
		const [, family, major, minor] = match;
		const name = family!.charAt(0).toUpperCase() + family!.slice(1);
		return `${name} ${major}.${minor}`;
	}

	if (MODEL_ALIASES.has(modelId.toLowerCase())) {
		return modelId.charAt(0).toUpperCase() + modelId.slice(1).toLowerCase();
	}

	return modelId;
}

/** Return a color based on context window utilization percentage. */
export function getContextBarColor(
	percent: number | null,
	theme: Theme,
): string {
	if (percent === null) return theme.status.neutral;
	if (percent < 60) return theme.contextBar.low;
	if (percent < 80) return theme.status.warning;
	if (percent < 95) return theme.contextBar.medium;
	return theme.contextBar.high;
}

/** Format a SessionStatsSnapshot as multi-line plain text. */
export function formatStatsSnapshot(snapshot: SessionStatsSnapshot): string {
	const {metrics, tokens, elapsed} = snapshot;
	const lines: string[] = [];

	lines.push('Session Statistics');
	lines.push('──────────────────');

	lines.push(`  Model:        ${formatModelName(metrics.modelName)}`);
	lines.push(`  Duration:     ${formatDuration(elapsed)}`);
	lines.push(
		`  Tool calls:   ${metrics.totalToolCallCount} total (${metrics.toolCallCount} main, ${metrics.totalToolCallCount - metrics.toolCallCount} subagent)`,
	);
	lines.push(`  Sub-agents:   ${metrics.subagentCount}`);
	lines.push(
		`  Permissions:  ${metrics.permissions.allowed} allowed, ${metrics.permissions.denied} denied`,
	);

	lines.push('');
	lines.push('Tokens');
	lines.push('──────');
	lines.push(`  Input:        ${formatTokens(tokens.input)}`);
	lines.push(`  Output:       ${formatTokens(tokens.output)}`);
	lines.push(`  Cache read:   ${formatTokens(tokens.cacheRead)}`);
	lines.push(`  Cache write:  ${formatTokens(tokens.cacheWrite)}`);
	lines.push(`  Total:        ${formatTokens(tokens.total)}`);

	if (metrics.subagentMetrics.length > 0) {
		lines.push('');
		lines.push('Sub-agents');
		lines.push('──────────');
		for (const sub of metrics.subagentMetrics) {
			lines.push(`  ${sub.agentType} — ${sub.toolCallCount} tools`);
		}
	}

	return lines.join('\n');
}
