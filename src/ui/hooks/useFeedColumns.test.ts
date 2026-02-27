/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useFeedColumns} from './useFeedColumns';
import type {TimelineEntry} from '../../core/feed/timeline';

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
	return {
		id: 'e1',
		ts: Date.now(),
		op: 'Tool OK',
		opTag: 'tool.ok',
		actor: 'AGENT',
		actorId: 'agent:root',
		toolColumn: 'Read',
		summary: 'Read src/app.ts',
		summarySegments: [{text: 'Read', role: 'verb'}],
		searchText: 'read src/app.ts',
		error: false,
		expandable: false,
		details: '',
		duplicateActor: false,
		...overrides,
	};
}

describe('useFeedColumns', () => {
	it('enforces at least 2 columns between DETAILS and RESULT when result exists', () => {
		const entries = [makeEntry({summaryOutcome: 'exit 1'})];
		const {result} = renderHook(() => useFeedColumns(entries, 160));

		expect(result.current.resultW).toBeGreaterThan(0);
		expect(result.current.gapW).toBe(1);
		expect(result.current.detailsResultGapW).toBeGreaterThanOrEqual(2);
	});

	it('keeps DETAILS->RESULT gap aligned with regular gap when regular gap is wider', () => {
		const entries = [makeEntry({summaryOutcome: 'replaced 19 -> 27 lines'})];
		const {result} = renderHook(() => useFeedColumns(entries, 260));

		expect(result.current.gapW).toBe(2);
		expect(result.current.detailsResultGapW).toBe(2);
	});

	it('does not reserve DETAILS->RESULT gap when RESULT column is absent', () => {
		const entries = [makeEntry()];
		const {result} = renderHook(() => useFeedColumns(entries, 160));

		expect(result.current.resultW).toBe(0);
		expect(result.current.detailsResultGapW).toBe(0);
	});
});
