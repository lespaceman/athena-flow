import {describe, expect, it} from 'vitest';
import {buildBodyLines, opCategory} from './buildBodyLines.js';
import {type TimelineEntry} from '../feed/timeline.js';
import {type TodoPanelItem} from '../feed/todoPanel.js';
import {darkTheme} from '../theme/themes.js';
import stripAnsi from 'strip-ansi';

describe('opCategory', () => {
	it('extracts prefix before first dot', () => {
		expect(opCategory('tool.call')).toBe('tool');
		expect(opCategory('tool.ok')).toBe('tool');
		expect(opCategory('perm.req')).toBe('perm');
		expect(opCategory('sub.start')).toBe('sub');
		expect(opCategory('agent.msg')).toBe('agent');
		expect(opCategory('run.start')).toBe('run');
	});

	it('returns full op when no dot', () => {
		expect(opCategory('prompt')).toBe('prompt');
		expect(opCategory('notify')).toBe('notify');
	});
});

/** Create a minimal TimelineEntry for testing. */
function makeEntry(id: string, ts: number, opTag = 'tool.call'): TimelineEntry {
	return {
		id,
		ts,
		op: 'Tool Call',
		opTag,
		actor: 'agent',
		actorId: 'agent:root',
		toolColumn: '',
		summary: `summary-${id}`,
		summarySegments: [{text: `summary-${id}`, role: 'plain'}],
		searchText: `summary-${id}`,
		error: false,
		expandable: false,
		details: '',
	};
}

/** Create a minimal TodoPanelItem for testing. */
function makeTodoItem(
	id: string,
	status: 'pending' | 'in_progress' | 'done' = 'pending',
): TodoPanelItem {
	return {id, text: `task-${id}`, status};
}

const defaultTheme = darkTheme;

function buildFeedOnly(
	entries: TimelineEntry[],
	feedContentRows: number,
): string[] {
	const bodyHeight = 1 + feedContentRows; // 1 header + content
	return buildBodyLines({
		innerWidth: 80,
		bodyHeight,
		detail: null,
		feed: {
			feedHeaderRows: 1,
			feedContentRows,
			feedViewportStart: 0,
			visibleFeedEntries: entries,
			filteredEntries: entries,
			feedCursor: 0,
			expandedId: null,
			focusMode: 'feed',
			searchMatchSet: new Set(),
		},
		todo: {
			actualTodoRows: 0,
			todoPanel: {todoScroll: 0, todoCursor: 0, visibleTodoItems: []},
			focusMode: 'feed',
			ascii: true,
			appMode: 'idle',
			doneCount: 0,
			totalCount: 0,
			spinnerFrame: '*',
		},
		runOverlay: {
			actualRunOverlayRows: 0,
			runSummaries: [],
			runFilter: 'all',
		},
		theme: defaultTheme,
	});
}

function buildTodoOnly(
	items: TodoPanelItem[],
	actualTodoRows: number,
	tScroll: number,
): string[] {
	return buildBodyLines({
		innerWidth: 80,
		bodyHeight: 20,
		detail: null,
		feed: {
			feedHeaderRows: 1,
			feedContentRows: 20 - actualTodoRows - 1,
			feedViewportStart: 0,
			visibleFeedEntries: [],
			filteredEntries: [],
			feedCursor: 0,
			expandedId: null,
			focusMode: 'feed',
			searchMatchSet: new Set(),
		},
		todo: {
			actualTodoRows,
			todoPanel: {
				todoScroll: tScroll,
				todoCursor: tScroll,
				visibleTodoItems: items,
			},
			focusMode: 'todo',
			ascii: true,
			appMode: 'idle',
			doneCount: 0,
			totalCount: items.length,
			spinnerFrame: '*',
		},
		runOverlay: {
			actualRunOverlayRows: 0,
			runSummaries: [],
			runFilter: 'all',
		},
		theme: defaultTheme,
	});
}

describe('buildBodyLines — Bug #5: minute separators respect line budget', () => {
	it('does not emit more than feedContentRows lines for feed entries', () => {
		// 5 entries across 3 minutes — would produce 7 lines (5 entries + 2 separators)
		// The loop must stop at feedContentRows=5 lines, not overflow bodyHeight
		const entries: TimelineEntry[] = [
			makeEntry('a', 0),
			makeEntry('b', 30000),
			makeEntry('c', 60000),
			makeEntry('d', 120000),
			makeEntry('e', 120001),
		];

		const feedContentRows = 5;
		const result = buildFeedOnly(entries, feedContentRows);

		// bodyHeight = 6 (1 header + 5 content). Output must be exactly bodyHeight.
		expect(result).toHaveLength(6);

		// Count non-blank lines in the feed area (after the header)
		const feedArea = result.slice(1); // skip header
		const entryLines = feedArea.filter(l => stripAnsi(l).trim() !== '');
		const blankLines = feedArea.filter(l => stripAnsi(l).trim() === '');

		// With separators, we get 3 entries + 2 separators = 5 lines (the budget).
		// The key invariant: entries + separators together don't exceed feedContentRows.
		expect(entryLines.length + blankLines.length).toBe(feedContentRows);
		// At least 3 entries should be visible (5 - 2 separators)
		expect(entryLines.length).toBeGreaterThanOrEqual(3);
	});

	it('renders entries past the separator when accessed via filteredEntries', () => {
		// The loop reads from filteredEntries (not visibleFeedEntries), so
		// entries beyond the old slice boundary should be accessible
		const entries: TimelineEntry[] = [
			makeEntry('a', 0),
			makeEntry('b', 60000), // minute 1 → separator
			makeEntry('c', 120000), // minute 2 → separator
		];

		// feedContentRows = 3 but 2 separators → only 1 entry fits if loop is correct
		// The key: entry 'c' at index 2 is still in filteredEntries and the loop
		// can reach it if it has lines left after the separators
		const bodyHeight = 4; // 1 header + 3 content
		const result = buildBodyLines({
			innerWidth: 80,
			bodyHeight,
			detail: null,
			feed: {
				feedHeaderRows: 1,
				feedContentRows: 3,
				feedViewportStart: 0,
				visibleFeedEntries: entries,
				filteredEntries: entries,
				feedCursor: 0,
				expandedId: null,
				focusMode: 'feed',
				searchMatchSet: new Set(),
			},
			todo: {
				actualTodoRows: 0,
				todoPanel: {todoScroll: 0, todoCursor: 0, visibleTodoItems: []},
				focusMode: 'feed',
				ascii: true,
				appMode: 'idle',
				doneCount: 0,
				totalCount: 0,
				spinnerFrame: '*',
			},
			runOverlay: {
				actualRunOverlayRows: 0,
				runSummaries: [],
				runFilter: 'all',
			},
			theme: defaultTheme,
		});

		// Should have exactly bodyHeight lines
		expect(result).toHaveLength(bodyHeight);
		// Entry 'a' must be present (first entry, always rendered)
		const allText = result.map(l => stripAnsi(l)).join('\n');
		expect(allText).toContain('summary-a');
	});
});

describe('buildBodyLines — Bug #6: todo hasScrollDown with scroll-up affordance', () => {
	it('shows scroll-down indicator when items are hidden due to scroll-up affordance', () => {
		// 4 items, actualTodoRows=5 → itemSlots = 3 (5 - 2 for header+divider)
		// tScroll=1 → hasScrollUp = true → tentativeRenderSlots = 2
		// hasScrollDown should be: 1 + 2 < 4 = true
		// Bug: old code computes hasScrollDown = 1 + 3 < 4 = false → items[3] unreachable
		const items = Array.from({length: 4}, (_, i) => makeTodoItem(String(i)));

		const result = buildTodoOnly(items, 5, 1);
		const allText = result.map(l => stripAnsi(l)).join('\n');

		// With correct two-pass calculation, we should see a scroll-down indicator
		expect(allText).toMatch(/\+\d+ more/);
	});
});
