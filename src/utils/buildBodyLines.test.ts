import {describe, expect, it} from 'vitest';
import {buildBodyLines, opCategory} from './buildBodyLines.js';
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

/** Create a minimal TodoPanelItem for testing. */
function makeTodoItem(
	id: string,
	status: 'pending' | 'in_progress' | 'done' = 'pending',
): TodoPanelItem {
	return {id, text: `task-${id}`, status};
}

const defaultTheme = darkTheme;

function buildTodoOnly(
	items: TodoPanelItem[],
	actualTodoRows: number,
	tScroll: number,
): string[] {
	return buildBodyLines({
		innerWidth: 80,
		detail: null,
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

describe('buildBodyLines — detail header', () => {
	it('uses tool name as detail header label with compact metadata', () => {
		const result = buildBodyLines({
			innerWidth: 90,
			detail: {
				expandedEntry: {
					id: '73610707-05fa-4730-9f06-e18fa2773f41',
					ts: Date.now(),
					op: 'Tool OK',
					opTag: 'tool.ok',
					actor: 'AGENT',
					actorId: 'agent:root',
					toolColumn: 'Read',
					summary: 'Read /tmp/sample.ts',
					summarySegments: [],
					searchText: '',
					error: false,
					expandable: true,
					details: '',
					duplicateActor: false,
				},
				detailScroll: 0,
				maxDetailScroll: 0,
				detailLines: ['line-1'],
				detailContentRows: 1,
				showLineNumbers: false,
			},
			todo: {
				actualTodoRows: 0,
				todoPanel: {
					todoScroll: 0,
					todoCursor: 0,
					visibleTodoItems: [],
				},
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

		const header = stripAnsi(result[0] ?? '');
		expect(header).toContain('Read');
		expect(header).not.toContain('DETAILS |');
		expect(header).toContain('Tool OK');
		expect(header).toContain('Esc back');
		expect(header).not.toContain('@agent:root');
	});

	it('adds one spacer line after detail header when there is room', () => {
		const result = buildBodyLines({
			innerWidth: 60,
			detail: {
				expandedEntry: {
					id: 'E1',
					ts: Date.now(),
					op: 'Tool OK',
					opTag: 'tool.ok',
					actor: 'AGENT',
					actorId: 'agent:root',
					toolColumn: 'Edit',
					summary: 'summary',
					summarySegments: [],
					searchText: '',
					error: false,
					expandable: true,
					details: '',
					duplicateActor: false,
				},
				detailScroll: 0,
				maxDetailScroll: 0,
				detailLines: ['line-a', 'line-b'],
				detailContentRows: 3,
				showLineNumbers: false,
			},
			todo: {
				actualTodoRows: 0,
				todoPanel: {
					todoScroll: 0,
					todoCursor: 0,
					visibleTodoItems: [],
				},
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

		expect(stripAnsi(result[1] ?? '').trim()).toBe('');
		expect(stripAnsi(result[2] ?? '')).toContain('line-a');
	});
});
