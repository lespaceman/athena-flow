import {describe, it, expect, vi} from 'vitest';
import {
	shortenPath,
	formatTokens,
	formatDuration,
	formatProgressBar,
	formatModelName,
	getContextBarColor,
	formatStatsSnapshot,
} from './formatters';
import type {SessionStatsSnapshot} from '../types/headerMetrics';

const theme = {
	status: {neutral: 'neutral', warning: 'warning'},
	contextBar: {low: 'low', medium: 'medium', high: 'high'},
};

vi.mock('node:os', () => ({
	default: {homedir: () => '/home/testuser'},
}));

describe('shortenPath', () => {
	it('replaces home directory with ~', () => {
		expect(shortenPath('/home/testuser/Documents')).toBe('~/Documents');
	});

	it('leaves paths outside home unchanged', () => {
		expect(shortenPath('/tmp/project')).toBe('/tmp/project');
	});

	it('handles exact home directory', () => {
		expect(shortenPath('/home/testuser')).toBe('~');
	});
});

describe('formatTokens', () => {
	it('returns -- for null', () => {
		expect(formatTokens(null)).toBe('--');
	});

	it('returns "0" for zero', () => {
		expect(formatTokens(0)).toBe('0');
	});

	it('returns raw number below 1000', () => {
		expect(formatTokens(842)).toBe('842');
	});

	it('formats thousands with k suffix', () => {
		expect(formatTokens(53300)).toBe('53.3k');
	});

	it('drops decimal for even thousands', () => {
		expect(formatTokens(5000)).toBe('5k');
	});

	it('promotes to m when rounding crosses 1000k boundary', () => {
		expect(formatTokens(999950)).toBe('1m');
	});

	it('formats millions with m suffix', () => {
		expect(formatTokens(1500000)).toBe('1.5m');
	});

	it('drops decimal for even millions', () => {
		expect(formatTokens(2000000)).toBe('2m');
	});
});

describe('formatDuration', () => {
	it('formats zero seconds', () => {
		expect(formatDuration(0)).toBe('0s');
	});

	it('formats seconds only', () => {
		expect(formatDuration(45)).toBe('45s');
	});

	it('formats minutes and seconds', () => {
		expect(formatDuration(272)).toBe('4m32s');
	});

	it('formats exact minutes', () => {
		expect(formatDuration(120)).toBe('2m');
	});

	it('formats hours, minutes, and seconds', () => {
		expect(formatDuration(3661)).toBe('1h1m1s');
	});

	it('formats exact hours', () => {
		expect(formatDuration(3600)).toBe('1h');
	});

	it('handles negative values as 0s', () => {
		expect(formatDuration(-5)).toBe('0s');
	});
});

describe('formatProgressBar', () => {
	it('returns -- for null', () => {
		expect(formatProgressBar(null)).toBe('--');
	});

	it('renders empty bar at 0%', () => {
		const bar = formatProgressBar(0, 10);
		expect(bar).toBe('\u2591'.repeat(10));
	});

	it('renders full bar at 100%', () => {
		const bar = formatProgressBar(100, 10);
		expect(bar).toBe('\u2588'.repeat(10));
	});

	it('renders partial fill at 50%', () => {
		const bar = formatProgressBar(50, 10);
		expect(bar).toBe('\u2588'.repeat(5) + '\u2591'.repeat(5));
	});

	it('clamps values above 100', () => {
		const bar = formatProgressBar(150, 10);
		expect(bar).toBe('\u2588'.repeat(10));
	});

	it('clamps values below 0', () => {
		const bar = formatProgressBar(-10, 10);
		expect(bar).toBe('\u2591'.repeat(10));
	});
});

describe('formatModelName', () => {
	it('returns -- for null', () => {
		expect(formatModelName(null)).toBe('--');
	});

	it('formats claude-opus-4-6', () => {
		expect(formatModelName('claude-opus-4-6')).toBe('Opus 4.6');
	});

	it('formats claude-sonnet-4-5-20250929', () => {
		expect(formatModelName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
	});

	it('formats claude-haiku-4-5-20251001', () => {
		expect(formatModelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
	});

	it('formats model aliases', () => {
		expect(formatModelName('opus')).toBe('Opus');
		expect(formatModelName('sonnet')).toBe('Sonnet');
		expect(formatModelName('haiku')).toBe('Haiku');
	});

	it('returns unknown model strings as-is', () => {
		expect(formatModelName('gpt-4o')).toBe('gpt-4o');
	});
});

describe('getContextBarColor', () => {
	it('returns neutral for null', () => {
		expect(getContextBarColor(null, theme)).toBe(theme.status.neutral);
	});

	it('returns low below 60%', () => {
		expect(getContextBarColor(30, theme)).toBe(theme.contextBar.low);
		expect(getContextBarColor(59, theme)).toBe(theme.contextBar.low);
	});

	it('returns warning at 60-79%', () => {
		expect(getContextBarColor(60, theme)).toBe(theme.status.warning);
		expect(getContextBarColor(79, theme)).toBe(theme.status.warning);
	});

	it('returns medium at 80-94%', () => {
		expect(getContextBarColor(80, theme)).toBe(theme.contextBar.medium);
		expect(getContextBarColor(94, theme)).toBe(theme.contextBar.medium);
	});

	it('returns high at 95%+', () => {
		expect(getContextBarColor(95, theme)).toBe(theme.contextBar.high);
		expect(getContextBarColor(100, theme)).toBe(theme.contextBar.high);
	});
});

function makeSnapshot(
	overrides?: Partial<SessionStatsSnapshot>,
): SessionStatsSnapshot {
	return {
		metrics: {
			modelName: 'claude-opus-4-6',
			toolCallCount: 5,
			totalToolCallCount: 12,
			subagentCount: 2,
			subagentMetrics: [
				{
					agentId: 'a1',
					agentType: 'Explore',
					toolCallCount: 4,
					tokenCount: null,
				},
				{
					agentId: 'a2',
					agentType: 'Plan',
					toolCallCount: 3,
					tokenCount: null,
				},
			],
			permissions: {allowed: 8, denied: 1},
			sessionStartTime: new Date('2024-01-15T10:00:00Z'),
			tokens: {
				input: null,
				output: null,
				cacheRead: null,
				cacheWrite: null,
				total: null,
				contextSize: null,
			},
		},
		tokens: {
			input: 53300,
			output: 12000,
			cacheRead: 100000,
			cacheWrite: 5000,
			total: 170300,
			contextSize: 42,
		},
		elapsed: 272,
		...overrides,
	};
}

describe('formatStatsSnapshot', () => {
	it('formats populated snapshot with subagents', () => {
		const output = formatStatsSnapshot(makeSnapshot());
		expect(output).toContain('Session Statistics');
		expect(output).toContain('Opus 4.6');
		expect(output).toContain('4m32s');
		expect(output).toContain('12 total (5 main, 7 subagent)');
		expect(output).toContain('8 allowed, 1 denied');
		expect(output).toContain('53.3k');
		expect(output).toContain('12k');
		expect(output).toContain('170.3k');
		expect(output).toContain('Sub-agents\n──────────');
		expect(output).toContain('Explore');
		expect(output).toContain('Plan');
	});

	it('formats snapshot with null/empty data', () => {
		const output = formatStatsSnapshot(
			makeSnapshot({
				metrics: {
					modelName: null,
					toolCallCount: 0,
					totalToolCallCount: 0,
					subagentCount: 0,
					subagentMetrics: [],
					permissions: {allowed: 0, denied: 0},
					sessionStartTime: null,
					tokens: {
						input: null,
						output: null,
						cacheRead: null,
						cacheWrite: null,
						total: null,
						contextSize: null,
					},
				},
				tokens: {
					input: null,
					output: null,
					cacheRead: null,
					cacheWrite: null,
					total: null,
					contextSize: null,
				},
				elapsed: 0,
			}),
		);
		expect(output).toContain('--');
		expect(output).toContain('0s');
		expect(output).toContain('0 total (0 main, 0 subagent)');
		expect(output).not.toContain('Sub-agents\n──────────');
	});
});
