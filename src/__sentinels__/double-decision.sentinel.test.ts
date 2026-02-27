/**
 * ARCHITECTURAL SENTINEL
 *
 * Protects: Single-decision-per-request invariant (no duplicate permission grants)
 * Risk weight: 4
 *
 * If this test fails, investigate pipeline integrity before touching assertions.
 */
import {describe, it, expect, afterEach} from 'vitest';
import {createFeedMapper} from '../feed/mapper';
import {makeEvent, makeDecision, resetCounter} from './helpers';

describe('Sentinel: double-decision race', () => {
	afterEach(() => resetCounter());

	it('second decision for same request is rejected (returns null)', () => {
		const mapper = createFeedMapper();

		mapper.mapEvent(makeEvent('SessionStart'));
		mapper.mapEvent(makeEvent('UserPromptSubmit'));
		const permReq = makeEvent('PermissionRequest');
		mapper.mapEvent(permReq);

		const first = mapper.mapDecision(
			permReq.id,
			makeDecision({kind: 'permission_allow'}),
		);
		expect(first).not.toBeNull();
		expect(first!.kind).toBe('permission.decision');

		// Second decision: must be rejected
		const second = mapper.mapDecision(
			permReq.id,
			makeDecision({kind: 'permission_deny', reason: 'changed mind'}),
		);
		expect(second).toBeNull();
	});

	it('late decision after run boundary is rejected', () => {
		const mapper = createFeedMapper();

		mapper.mapEvent(makeEvent('SessionStart'));
		mapper.mapEvent(makeEvent('UserPromptSubmit'));
		const permReq = makeEvent('PermissionRequest');
		mapper.mapEvent(permReq);

		// End run (correlation indexes clear per CLAUDE.md)
		mapper.mapEvent(makeEvent('Stop'));

		// New run
		mapper.mapEvent(makeEvent('UserPromptSubmit'));

		// Late decision from old run
		const late = mapper.mapDecision(
			permReq.id,
			makeDecision({kind: 'permission_allow'}),
		);
		expect(late).toBeNull();
	});
});
