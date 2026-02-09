/**
 * Pure formatting utilities for the Header component.
 */

import os from 'node:os';
import type {SessionStatsSnapshot} from '../types/headerMetrics.js';

/**
 * Shorten a filesystem path by replacing the home directory with ~.
 */
export function shortenPath(fullPath: string): string {
	const home = os.homedir();
	if (fullPath.startsWith(home)) {
		return '~' + fullPath.slice(home.length);
	}
	return fullPath;
}

/**
 * Format a token count for compact display.
 * - null → "--"
 * - 0 → "0"
 * - < 1000 → as-is (e.g. "842")
 * - >= 1000 → "X.Xk" (e.g. 53300 → "53.3k")
 * - >= 1000000 → "X.Xm" (e.g. 1500000 → "1.5m")
 */
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

/**
 * Format elapsed seconds into a human-readable duration.
 * - 0 → "0s"
 * - 45 → "45s"
 * - 272 → "4m32s"
 * - 3661 → "1h1m1s"
 */
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

/**
 * Render a text-based progress bar.
 * - null → "--"
 * - 42, 12 → "█████░░░░░░░"
 */
export function formatProgressBar(
	percent: number | null,
	width: number = 12,
): string {
	if (percent === null) return '--';
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * width);
	return FILL_CHAR.repeat(filled) + EMPTY_CHAR.repeat(width - filled);
}

/**
 * Map a model ID string to a short display name.
 * - "claude-opus-4-6" → "Opus 4.6"
 * - "claude-sonnet-4-5-20250929" → "Sonnet 4.5"
 * - "claude-haiku-4-5-20251001" → "Haiku 4.5"
 * - null → "--"
 * - Unknown formats → returned as-is
 */
export function formatModelName(modelId: string | null): string {
	if (modelId === null) return '--';

	// Match patterns like claude-opus-4-6, claude-sonnet-4-5-20250929
	const match = modelId.match(/^claude-(\w+)-(\d+)-(\d+)(?:-\d{8})?$/);
	if (match) {
		const [, family, major, minor] = match;
		const name = family!.charAt(0).toUpperCase() + family!.slice(1);
		return `${name} ${major}.${minor}`;
	}

	return modelId;
}

/**
 * Return a color name based on context window utilization.
 * - null → "gray"
 * - < 60% → "green"
 * - 60-80% → "yellow"
 * - 80-95% → "#FF8C00" (orange)
 * - > 95% → "red"
 */
export function getContextBarColor(percent: number | null): string {
	if (percent === null) return 'gray';
	if (percent < 60) return 'green';
	if (percent < 80) return 'yellow';
	if (percent < 95) return '#FF8C00';
	return 'red';
}

/**
 * Format a SessionStatsSnapshot as multi-line plain text.
 */
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
