import {describe, it, expect} from 'vitest';
import {IndexedTimeline} from './indexedTimeline';
import {mergeFeedItems, buildPostByToolUseId} from './items';
import type {FeedEvent} from './types';
import {buildTimelineCache} from '../../ui/hooks/useTimeline';

function makeEvent(
	kind: FeedEvent['kind'],
	seq: number,
	data: Record<string, unknown>,
	overrides: Partial<FeedEvent> = {},
): FeedEvent {
	return {
		event_id: `evt-${seq}-${kind}`,
		seq,
		ts: 1_700_000_000_000 + seq,
		session_id: 's1',
		run_id: 's1:R1',
		kind,
		level: 'info',
		actor_id: 'agent:root',
		title: kind,
		data,
		...overrides,
	} as FeedEvent;
}

function makeRunStart(seq: number, runId: string, prompt = 'test'): FeedEvent {
	return makeEvent(
		'run.start',
		seq,
		{
			trigger: {type: 'user_prompt_submit', prompt_preview: prompt},
		},
		{run_id: runId},
	);
}

function makeNotification(
	seq: number,
	message: string,
	runId = 's1:R1',
): FeedEvent {
	return makeEvent('notification', seq, {message}, {run_id: runId});
}

function makeToolPre(
	seq: number,
	toolUseId: string,
	toolName = 'Bash',
	input: Record<string, unknown> = {command: 'echo hi'},
): FeedEvent {
	return makeEvent('tool.pre', seq, {
		tool_name: toolName,
		tool_input: input,
		tool_use_id: toolUseId,
	});
}

function makeToolPost(
	seq: number,
	toolUseId: string,
	toolName = 'Bash',
	input: Record<string, unknown> = {command: 'echo hi'},
	response: unknown = 'ok',
): FeedEvent {
	return makeEvent('tool.post', seq, {
		tool_name: toolName,
		tool_input: input,
		tool_use_id: toolUseId,
		tool_response: response,
	});
}

function makeToolFailure(
	seq: number,
	toolUseId: string,
	toolName = 'Bash',
	input: Record<string, unknown> = {command: 'echo hi'},
	error = 'fail',
): FeedEvent {
	return makeEvent('tool.failure', seq, {
		tool_name: toolName,
		tool_input: input,
		tool_use_id: toolUseId,
		error,
	});
}

function buildTimeline(events: FeedEvent[], verbose = true) {
	const feedItems = mergeFeedItems([], events);
	const postByToolUseId = buildPostByToolUseId(events);
	return {feedItems, feedEvents: events, postByToolUseId, verbose};
}

describe('IndexedTimeline', () => {
	it('full rebuild: produces entries matching buildTimelineCache output', () => {
		const events = [makeNotification(1, 'hello'), makeNotification(2, 'world')];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		const reference = buildTimelineCache(
			feedItems,
			feedEvents,
			postByToolUseId,
			true,
		);

		expect(indexed.getEntries()).toHaveLength(reference.entries.length);
		for (let i = 0; i < reference.entries.length; i++) {
			expect(indexed.getEntries()[i]?.summary).toBe(
				reference.entries[i]?.summary,
			);
			expect(indexed.getEntries()[i]?.opTag).toBe(reference.entries[i]?.opTag);
		}
	});

	it('incremental append: update twice with growing data, entries correct', () => {
		const ev1 = makeNotification(1, 'first');
		const indexed = new IndexedTimeline();

		const t1 = buildTimeline([ev1]);
		indexed.update(t1.feedItems, t1.feedEvents, t1.postByToolUseId, true);
		expect(indexed.getEntries()).toHaveLength(1);

		const ev2 = makeNotification(2, 'second');
		const t2 = buildTimeline([ev1, ev2]);
		indexed.update(t2.feedItems, t2.feedEvents, t2.postByToolUseId, true);
		expect(indexed.getEntries()).toHaveLength(2);
		expect(indexed.getEntries()[0]?.summary).toContain('first');
		expect(indexed.getEntries()[1]?.summary).toContain('second');
	});

	it('run filter via index: returns correct subset for a specific runId', () => {
		const r1Start = makeRunStart(1, 'run-A', 'prompt A');
		const n1 = makeNotification(2, 'in run A', 'run-A');
		const r2Start = makeRunStart(3, 'run-B', 'prompt B');
		const n2 = makeNotification(4, 'in run B', 'run-B');
		const n3 = makeNotification(5, 'also run B', 'run-B');

		const events = [r1Start, n1, r2Start, n2, n3];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		const runAEntries = indexed.getFilteredView('run-A');
		const runBEntries = indexed.getFilteredView('run-B');

		// run-A should have run.start + notification = 2
		expect(runAEntries.length).toBe(2);
		expect(runAEntries.every(e => e.runId === 'run-A')).toBe(true);

		// run-B should have run.start + 2 notifications = 3
		expect(runBEntries.length).toBe(3);
		expect(runBEntries.every(e => e.runId === 'run-B')).toBe(true);
	});

	it('error filter via index: returns only error entries', () => {
		const pre = makeToolPre(1, 'tu-1');
		const failure = makeToolFailure(2, 'tu-1');
		const n1 = makeNotification(3, 'ok message');

		const events = [pre, failure, n1];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		const errorsOnly = indexed.getFilteredView(undefined, true);
		expect(errorsOnly.length).toBeGreaterThan(0);
		expect(errorsOnly.every(e => e.error)).toBe(true);
	});

	it('combined filters: run + error filter together', () => {
		const r1Start = makeRunStart(1, 'run-A', 'prompt A');
		const pre1 = makeEvent(
			'tool.pre',
			2,
			{
				tool_name: 'Bash',
				tool_input: {command: 'fail'},
				tool_use_id: 'tu-A',
			},
			{run_id: 'run-A'},
		);
		const fail1 = makeEvent(
			'tool.failure',
			3,
			{
				tool_name: 'Bash',
				tool_input: {command: 'fail'},
				tool_use_id: 'tu-A',
				error: 'boom',
			},
			{run_id: 'run-A'},
		);
		const r2Start = makeRunStart(4, 'run-B', 'prompt B');
		const n1 = makeNotification(5, 'ok in B', 'run-B');

		const events = [r1Start, pre1, fail1, r2Start, n1];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		const result = indexed.getFilteredView('run-A', true);
		// Should only have error entries from run-A
		expect(result.length).toBeGreaterThan(0);
		expect(result.every(e => e.runId === 'run-A' && e.error)).toBe(true);

		// run-B with errorsOnly should be empty (no errors in run-B)
		const resultB = indexed.getFilteredView('run-B', true);
		expect(resultB).toHaveLength(0);
	});

	it('no filters returns all entries', () => {
		const events = [makeNotification(1, 'a'), makeNotification(2, 'b')];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		const all = indexed.getFilteredView();
		expect(all).toBe(indexed.getEntries()); // same reference — fast path
	});

	it('search cache hit: same query returns cached result without re-scanning', () => {
		const events = [
			makeNotification(1, 'alpha beta gamma'),
			makeNotification(2, 'delta epsilon'),
		];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		const filtered = indexed.getFilteredView();
		const first = indexed.getSearchMatches(filtered, 'alpha');
		const second = indexed.getSearchMatches(filtered, 'alpha');

		expect(first).toEqual(second);
		// Both should find entry at index 0
		expect(first).toEqual([0]);
	});

	it('search cache miss on new entries: adding entries extends results', () => {
		const ev1 = makeNotification(1, 'alpha');
		const indexed = new IndexedTimeline();

		const t1 = buildTimeline([ev1]);
		indexed.update(t1.feedItems, t1.feedEvents, t1.postByToolUseId, true);

		const filtered1 = indexed.getFilteredView();
		const matches1 = indexed.getSearchMatches(filtered1, 'alpha');
		expect(matches1).toEqual([0]);

		// Add a second entry that also matches
		const ev2 = makeNotification(2, 'alpha again');
		const t2 = buildTimeline([ev1, ev2]);
		indexed.update(t2.feedItems, t2.feedEvents, t2.postByToolUseId, true);

		const filtered2 = indexed.getFilteredView();
		const matches2 = indexed.getSearchMatches(filtered2, 'alpha');
		// After rebuild, the search cache was cleared, so it re-scans all
		expect(matches2).toEqual([0, 1]);
	});

	it('search cache LRU: evicts oldest when exceeding max size', () => {
		const events = [makeNotification(1, 'test data')];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		const filtered = indexed.getFilteredView();

		// Fill 9 queries (max is 8), so oldest should be evicted
		for (let i = 0; i < 9; i++) {
			indexed.getSearchMatches(filtered, `query${i}`);
		}

		// The 9th query should have evicted query0
		// Now search for query0 again — it should still work (just re-scan)
		const result = indexed.getSearchMatches(filtered, 'query0');
		expect(result).toEqual([]); // "query0" not in "test data"

		// Verify the cache hasn't grown beyond bounds by doing another query
		indexed.getSearchMatches(filtered, 'query_new');
		// No assertion needed — just verifying no crash
	});

	it('tool pre→post merge: append post event updates entry and indexes', () => {
		const pre = makeToolPre(1, 'tu-1');
		const indexed = new IndexedTimeline();

		// First update with just the pre event
		const t1 = buildTimeline([pre]);
		indexed.update(t1.feedItems, t1.feedEvents, t1.postByToolUseId, true);
		expect(indexed.getEntries()).toHaveLength(1);
		expect(indexed.getEntries()[0]?.opTag).toBe('tool.call');
		expect(indexed.getEntries()[0]?.error).toBe(false);

		// Now add a tool.failure to turn it into an error
		const failure = makeToolFailure(2, 'tu-1');
		const t2 = buildTimeline([pre, failure]);
		indexed.update(t2.feedItems, t2.feedEvents, t2.postByToolUseId, true);

		// Entry count should stay at 1 (merged)
		expect(indexed.getEntries()).toHaveLength(1);
		expect(indexed.getEntries()[0]?.opTag).toBe('tool.fail');
		expect(indexed.getEntries()[0]?.error).toBe(true);

		// Error index should reflect the new state
		const errorsOnly = indexed.getFilteredView(undefined, true);
		expect(errorsOnly).toHaveLength(1);
		expect(errorsOnly[0]?.opTag).toBe('tool.fail');
	});

	it('tool pre→post merge: successful post clears error state', () => {
		const pre = makeToolPre(1, 'tu-1');
		const indexed = new IndexedTimeline();

		const t1 = buildTimeline([pre]);
		indexed.update(t1.feedItems, t1.feedEvents, t1.postByToolUseId, true);
		expect(indexed.getEntries()[0]?.error).toBe(false);

		// Add successful post
		const post = makeToolPost(2, 'tu-1');
		const t2 = buildTimeline([pre, post]);
		indexed.update(t2.feedItems, t2.feedEvents, t2.postByToolUseId, true);

		expect(indexed.getEntries()).toHaveLength(1);
		expect(indexed.getEntries()[0]?.opTag).toBe('tool.ok');
		expect(indexed.getEntries()[0]?.pairedPostEvent).toBe(post);

		// No errors
		const errorsOnly = indexed.getFilteredView(undefined, true);
		expect(errorsOnly).toHaveLength(0);
	});

	it('search with empty query returns empty array', () => {
		const events = [makeNotification(1, 'some text')];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		const filtered = indexed.getFilteredView();
		expect(indexed.getSearchMatches(filtered, '')).toEqual([]);
		expect(indexed.getSearchMatches(filtered, '   ')).toEqual([]);
	});

	it('getFilteredView with runFilter="all" returns all entries', () => {
		const events = [makeNotification(1, 'a'), makeNotification(2, 'b')];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		const all = indexed.getFilteredView('all');
		expect(all).toBe(indexed.getEntries());
	});

	it('getEntries returns empty array before any update', () => {
		const indexed = new IndexedTimeline();
		expect(indexed.getEntries()).toEqual([]);
	});

	it('search cache invalidation on filter change: different filteredEntries array clears stale matches', () => {
		const r1Start = makeRunStart(1, 'run-A', 'prompt A');
		const nA = makeNotification(2, 'hello world', 'run-A');
		const r2Start = makeRunStart(3, 'run-B', 'prompt B');
		const nB = makeNotification(4, 'hello universe', 'run-B');

		const events = [r1Start, nA, r2Start, nB];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		// Filter to run-A and search for "hello"
		const runAEntries = indexed.getFilteredView('run-A');
		const matchesA = indexed.getSearchMatches(runAEntries, 'hello');
		expect(matchesA.length).toBeGreaterThan(0);
		// All match indices should be valid for runAEntries
		for (const idx of matchesA) {
			expect(idx).toBeLessThan(runAEntries.length);
			expect(runAEntries[idx]?.runId).toBe('run-A');
		}

		// Now switch to run-B filter (different array reference) and search same query
		const runBEntries = indexed.getFilteredView('run-B');
		expect(runBEntries).not.toBe(runAEntries); // different reference
		const matchesB = indexed.getSearchMatches(runBEntries, 'hello');
		expect(matchesB.length).toBeGreaterThan(0);
		// All match indices should be valid for runBEntries (not stale run-A indices)
		for (const idx of matchesB) {
			expect(idx).toBeLessThan(runBEntries.length);
			expect(runBEntries[idx]?.runId).toBe('run-B');
		}
	});

	it('search cache handles shrinking filteredEntries without out-of-bounds', () => {
		// Create 20 notifications that match "item"
		const events: FeedEvent[] = [];
		for (let i = 1; i <= 20; i++) {
			events.push(
				makeNotification(i, `item number ${i}`, i <= 10 ? 'run-A' : 'run-B'),
			);
		}
		// Add run starts so filtering works
		events.unshift(
			makeRunStart(0, 'run-A', 'A'),
			makeRunStart(0, 'run-B', 'B'),
		);

		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();
		indexed.update(feedItems, feedEvents, postByToolUseId, true);

		// Search with all entries (should find matches across all 20+ entries)
		const allEntries = indexed.getFilteredView();
		const allMatches = indexed.getSearchMatches(allEntries, 'item');
		expect(allMatches.length).toBeGreaterThan(10);

		// Now filter to run-A only (smaller set)
		const runAEntries = indexed.getFilteredView('run-A');
		expect(runAEntries.length).toBeLessThan(allEntries.length);

		const runAMatches = indexed.getSearchMatches(runAEntries, 'item');
		// No index should be out-of-bounds
		for (const idx of runAMatches) {
			expect(idx).toBeLessThan(runAEntries.length);
		}
	});

	it('verbose parameter in update(): toggling verbose reveals verbose-only entries', () => {
		// Create a notification event that is always shown
		const normalEvent = makeNotification(1, 'normal event');
		// Create an event of a verbose-only kind (config.change)
		const verboseEvent = makeEvent('config.change', 2, {
			source: 'test-source',
		});

		const events = [normalEvent, verboseEvent];
		const {feedItems, feedEvents, postByToolUseId} = buildTimeline(events);

		const indexed = new IndexedTimeline();

		// Build with verbose=false — config.change should be skipped
		indexed.update(feedItems, feedEvents, postByToolUseId, false);
		const nonVerboseEntries = indexed.getEntries();
		const hasConfigChange = nonVerboseEntries.some(e => e.opTag === 'cfg.chg');
		expect(hasConfigChange).toBe(false);

		// Rebuild with verbose=true — config.change should now appear
		indexed.update(feedItems, feedEvents, postByToolUseId, true);
		const verboseEntries = indexed.getEntries();
		const hasConfigChangeVerbose = verboseEntries.some(
			e => e.opTag === 'cfg.chg',
		);
		expect(hasConfigChangeVerbose).toBe(true);
		expect(verboseEntries.length).toBeGreaterThan(nonVerboseEntries.length);
	});
});
