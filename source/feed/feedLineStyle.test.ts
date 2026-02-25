import {describe, it, expect} from 'vitest';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {styleFeedLine} from './feedLineStyle.js';
import {type ResolvedSegment} from './timeline.js';
import {darkTheme} from '../theme/themes.js';

describe('styleFeedLine summary segments', () => {
	it('styles verb as bright and target as muted for tool.ok rows', () => {
		const prev = chalk.level;
		chalk.level = 3;
		try {
			const summary = 'Navigate google.com';
			const padded = summary + ' '.repeat(50);
			const line = ` 02:18 Tool OK    \u00B7          ${padded}\u25B8`;

			const segments: ResolvedSegment[] = [
				{start: 31, end: 39, role: 'verb'},
				{start: 39, end: 50, role: 'target'},
			];

			const result = styleFeedLine(line, {
				focused: false,
				matched: false,
				actorId: 'subagent:1',
				isError: false,
				theme: darkTheme,
				opTag: 'tool.ok',
				summarySegments: segments,
				duplicateActor: true,
			});

			// Strip ANSI to verify content is preserved
			expect(stripAnsi(result)).toContain('Navigate google.com');
			// Both text and muted colors must be present
			const textRgb = '201;209;217';
			const mutedRgb = '72;79;88';
			expect(result).toContain(`38;2;${textRgb}m`);
			expect(result).toContain(`38;2;${mutedRgb}m`);
		} finally {
			chalk.level = prev;
		}
	});

	it('applies warning color to outcome segment when outcomeZero', () => {
		const prev = chalk.level;
		chalk.level = 3;
		try {
			const summary = 'Glob tests/spec.ts';
			const outcome = '0 files';
			const fitted = summary + ' '.repeat(30) + '  ' + outcome + ' '.repeat(10);
			const line = ` 02:26 Tool OK    \u00B7          ${fitted}\u25B8`;

			const outcomeStart = line.indexOf('0 files');
			const segments: ResolvedSegment[] = [
				{start: 31, end: 35, role: 'verb'},
				{start: 35, end: 49, role: 'target'},
				{start: outcomeStart, end: outcomeStart + 7, role: 'outcome'},
			];

			const result = styleFeedLine(line, {
				focused: false,
				matched: false,
				actorId: 'subagent:1',
				isError: false,
				theme: darkTheme,
				opTag: 'tool.ok',
				summarySegments: segments,
				outcomeZero: true,
				duplicateActor: true,
			});

			// Strip ANSI to verify content
			expect(stripAnsi(result)).toContain('Glob tests/spec.ts');
			expect(stripAnsi(result)).toContain('0 files');
			// Warning color must be present for outcome
			const warningRgb = '210;153;34';
			expect(result).toContain(`38;2;${warningRgb}m`);
			// The warning-colored slice must include "0 files"
			const warningIdx = result.lastIndexOf(`38;2;${warningRgb}m`);
			expect(result.slice(warningIdx)).toContain('0 files');
		} finally {
			chalk.level = prev;
		}
	});

	it('renders plain segments with lifecycle muted style', () => {
		const prev = chalk.level;
		chalk.level = 3;
		try {
			const summary = 'interactive session started';
			const padded = summary + ' '.repeat(50);
			const line = ` 02:18 Sess Start root       ${padded} `;

			const segments: ResolvedSegment[] = [{start: 31, end: 58, role: 'plain'}];

			const result = styleFeedLine(line, {
				focused: false,
				matched: false,
				actorId: 'system',
				isError: false,
				theme: darkTheme,
				opTag: 'sess.start',
				summarySegments: segments,
			});

			expect(stripAnsi(result)).toContain('interactive session started');
			const mutedRgb = '72;79;88';
			expect(result).toContain(`38;2;${mutedRgb}m`);
		} finally {
			chalk.level = prev;
		}
	});
});
