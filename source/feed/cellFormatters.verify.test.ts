import {describe, test, expect} from 'vitest';
import stripAnsi from 'strip-ansi';
import {darkTheme} from '../theme/themes.js';
import {formatFeedLine, type TimelineEntry} from './timeline.js';
import {
	formatTime,
	formatEvent,
	formatActor,
	formatSuffix,
	formatDetails,
	fit,
} from './cellFormatters.js';

const theme = darkTheme;
const WIDTH = 80;

/**
 * Assemble a line from the new per-cell formatters, then strip ANSI
 * to get the plain-text equivalent for comparison with the old path.
 *
 * Layout mirrors formatFeedLine:
 *   gutter(1) + body(width-3) + suffix(2)
 *   body = fit(time(5) + " " + event(12) + " " + actor(10) + " " + summary(rest), bodyWidth)
 */
function assembleNewLine(
	entry: TimelineEntry,
	width: number,
	_focused: boolean,
	expanded: boolean,
	_matched: boolean,
	ascii: boolean,
	duplicateActor: boolean,
	_categoryBreak: boolean,
	_minuteBreak: boolean,
): string {
	const time = stripAnsi(formatTime(entry.ts, 5, theme));
	const event = stripAnsi(formatEvent(entry.op, 12, theme, entry.opTag));
	const actor = stripAnsi(
		formatActor(entry.actor, duplicateActor, 10, theme, entry.actorId),
	);

	const bodyWidth = Math.max(0, width - 3); // 1 gutter + 2 suffix
	const summaryWidth = Math.max(0, bodyWidth - 30); // 5+1+12+1+10+1 = 30

	const details = formatDetails({
		segments: entry.summarySegments,
		summary: entry.summary,
		outcome: entry.summaryOutcome,
		outcomeZero: entry.summaryOutcomeZero,
		mode: 'full',
		contentWidth: summaryWidth,
		theme,
		opTag: entry.opTag,
		isError: entry.error,
	});
	const summaryText = stripAnsi(details);

	const suffix = stripAnsi(
		formatSuffix(entry.expandable, expanded, ascii, theme),
	);

	// Assemble exactly like old path: " " + fit(cells, bodyWidth) + " " + glyph
	// Note: formatFeedLine always uses space for gutter (styling is done by styleFeedLine),
	// so we use space here for comparison, not the gutter glyph.
	const body = fit(`${time} ${event} ${actor} ${summaryText}`, bodyWidth);
	return ' ' + body + suffix;
}

function makeEntry(overrides: Partial<TimelineEntry>): TimelineEntry {
	return {
		id: 'test-1',
		ts: new Date('2025-06-15T14:30:00').getTime(),
		op: 'Tool OK',
		opTag: 'tool.ok',
		actor: 'AGENT',
		actorId: 'agent:root',
		toolColumn: 'Read',
		summary: 'src/app.tsx',
		summarySegments: [{text: 'src/app.tsx', role: 'target'}],
		searchText: 'src/app.tsx',
		error: false,
		expandable: false,
		details: '',
		duplicateActor: false,
		...overrides,
	};
}

describe('side-by-side: new formatters match old output', () => {
	const cases: Array<{
		name: string;
		entry: TimelineEntry;
		focused?: boolean;
		expanded?: boolean;
		matched?: boolean;
		duplicateActor?: boolean;
		categoryBreak?: boolean;
	}> = [
		{name: 'tool.ok basic', entry: makeEntry({})},
		{
			name: 'tool.fail error',
			entry: makeEntry({
				opTag: 'tool.fail',
				op: 'Tool Fail',
				error: true,
			}),
		},
		{
			name: 'agent message',
			entry: makeEntry({
				opTag: 'agent.msg',
				op: 'Agent Msg',
				toolColumn: '',
				summary: 'Hello user',
				summarySegments: [{text: 'Hello user', role: 'plain'}],
			}),
		},
		{
			name: 'with outcome',
			entry: makeEntry({summaryOutcome: '120 lines'}),
		},
		{
			name: 'outcome zero',
			entry: makeEntry({
				summaryOutcome: '0 files',
				summaryOutcomeZero: true,
			}),
		},
		{name: 'duplicate actor', entry: makeEntry({}), duplicateActor: true},
		{
			name: 'expandable collapsed',
			entry: makeEntry({expandable: true}),
		},
		{
			name: 'expandable expanded',
			entry: makeEntry({expandable: true}),
			expanded: true,
		},
		{name: 'category break', entry: makeEntry({}), categoryBreak: true},
		{
			name: 'long path truncation',
			entry: makeEntry({
				summary: 'src/very/deeply/nested/path/to/component.tsx',
				summarySegments: [
					{
						text: 'src/very/deeply/nested/path/to/component.tsx',
						role: 'target',
					},
				],
			}),
		},
	];

	for (const tc of cases) {
		test(`stripped text matches: ${tc.name}`, () => {
			const focused = tc.focused ?? false;
			const expanded = tc.expanded ?? false;
			const matched = tc.matched ?? false;
			const dup = tc.duplicateActor ?? false;

			// Old path
			const {line: oldLine} = formatFeedLine(
				tc.entry,
				WIDTH,
				focused,
				expanded,
				matched,
				false,
				dup,
			);

			// New path
			const newLine = assembleNewLine(
				tc.entry,
				WIDTH,
				focused,
				expanded,
				matched,
				false,
				dup,
				tc.categoryBreak ?? false,
				false,
			);

			expect(newLine).toBe(oldLine);
		});
	}
});
