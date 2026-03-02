/**
 * @vitest-environment jsdom
 */
import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useStaticFeed, type UseStaticFeedOptions} from './useStaticFeed';
import {type TimelineEntry} from '../../core/feed/timeline';
import {type FeedEventBase} from '../../core/feed/types';

function base(overrides: Partial<FeedEventBase> = {}): FeedEventBase {
	return {
		event_id: 'e1',
		seq: 1,
		ts: 1000000,
		session_id: 's1',
		run_id: 'R1',
		kind: 'run.start',
		level: 'info',
		actor_id: 'agent:root',
		title: '',
		...overrides,
	};
}

function makeEntry(
	id: string,
	overrides: Partial<TimelineEntry> = {},
): TimelineEntry {
	return {
		id,
		ts: 1000,
		op: 'Tool Call',
		opTag: 'tool.call',
		actor: 'root',
		actorId: 'agent:root',
		toolColumn: '',
		summary: '',
		summarySegments: [],
		searchText: '',
		error: false,
		expandable: false,
		details: '',
		duplicateActor: false,
		...overrides,
	};
}

function stableToolEntry(id: string): TimelineEntry {
	return makeEntry(id, {
		feedEvent: {
			...base({kind: 'tool.pre'}),
			kind: 'tool.pre' as const,
			data: {tool_name: 'Read', tool_input: {}},
		},
		pairedPostEvent: {
			...base({kind: 'tool.post'}),
			kind: 'tool.post' as const,
			data: {tool_name: 'Read', tool_input: {}, tool_response: {}},
		},
	});
}

function unstableToolEntry(id: string): TimelineEntry {
	return makeEntry(id, {
		feedEvent: {
			...base({kind: 'tool.pre'}),
			kind: 'tool.pre' as const,
			data: {tool_name: 'Read', tool_input: {}},
		},
	});
}

describe('useStaticFeed', () => {
	it('returns 0 initially with empty entries', () => {
		const {result} = renderHook(() =>
			useStaticFeed({
				filteredEntries: [],
				feedViewportStart: 0,
				tailFollow: true,
			}),
		);
		expect(result.current).toBe(0);
	});

	it('advances high-water mark for stable entries below viewport', () => {
		const entries = [
			stableToolEntry('e1'),
			stableToolEntry('e2'),
			stableToolEntry('e3'),
			unstableToolEntry('e4'),
		];
		const {result} = renderHook(() =>
			useStaticFeed({
				filteredEntries: entries,
				feedViewportStart: 3,
				tailFollow: true,
			}),
		);
		// e1, e2, e3 are stable and below viewport (indices 0,1,2 < 3)
		expect(result.current).toBe(3);
	});

	it('stops at unstable entry (no gaps)', () => {
		const entries = [
			stableToolEntry('e1'),
			unstableToolEntry('e2'),
			stableToolEntry('e3'),
		];
		const {result} = renderHook(() =>
			useStaticFeed({
				filteredEntries: entries,
				feedViewportStart: 3,
				tailFollow: true,
			}),
		);
		// Stops at e2 (index 1) because it's unstable
		expect(result.current).toBe(1);
	});

	it('does not advance when tailFollow is false', () => {
		const entries = [stableToolEntry('e1'), stableToolEntry('e2')];
		const {result} = renderHook(() =>
			useStaticFeed({
				filteredEntries: entries,
				feedViewportStart: 2,
				tailFollow: false,
			}),
		);
		expect(result.current).toBe(0);
	});

	it('does not advance past feedViewportStart', () => {
		const entries = [
			stableToolEntry('e1'),
			stableToolEntry('e2'),
			stableToolEntry('e3'),
		];
		const {result} = renderHook(() =>
			useStaticFeed({
				filteredEntries: entries,
				feedViewportStart: 1,
				tailFollow: true,
			}),
		);
		// Only e1 is below viewport
		expect(result.current).toBe(1);
	});

	it('high-water mark is monotonic across re-renders', () => {
		const entries = [
			stableToolEntry('e1'),
			stableToolEntry('e2'),
			stableToolEntry('e3'),
		];
		const initialProps: UseStaticFeedOptions = {
			filteredEntries: entries,
			feedViewportStart: 2,
			tailFollow: true,
		};
		const {result, rerender} = renderHook(
			(props: UseStaticFeedOptions) => useStaticFeed(props),
			{initialProps},
		);
		expect(result.current).toBe(2);

		// Re-render with feedViewportStart advanced further
		rerender({
			filteredEntries: entries,
			feedViewportStart: 3,
			tailFollow: true,
		});
		expect(result.current).toBe(3);
	});

	it('treats entries without feedEvent as stable', () => {
		const entries = [
			makeEntry('msg1'), // no feedEvent = message, always stable
			stableToolEntry('e2'),
		];
		const {result} = renderHook(() =>
			useStaticFeed({
				filteredEntries: entries,
				feedViewportStart: 2,
				tailFollow: true,
			}),
		);
		expect(result.current).toBe(2);
	});
});
