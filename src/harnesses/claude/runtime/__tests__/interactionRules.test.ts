import {describe, it, expect} from 'vitest';
import {getInteractionHints} from '../interactionRules';

describe('getInteractionHints', () => {
	it('returns correct hints for known event types', () => {
		const perm = getInteractionHints('PermissionRequest');
		expect(perm.expectsDecision).toBe(true);
		expect(perm.canBlock).toBe(true);
		expect(perm.defaultTimeoutMs).toBe(300_000);

		const pre = getInteractionHints('PreToolUse');
		expect(pre.expectsDecision).toBe(true);
		expect(pre.defaultTimeoutMs).toBe(300_000);

		const post = getInteractionHints('PostToolUse');
		expect(post.expectsDecision).toBe(false);
		expect(post.canBlock).toBe(false);

		const stop = getInteractionHints('Stop');
		expect(stop.expectsDecision).toBe(true);
		expect(stop.canBlock).toBe(true);
		expect(stop.defaultTimeoutMs).toBe(4000);
	});

	it('returns safe defaults for unknown events', () => {
		const unknown = getInteractionHints('FutureNewEvent');
		expect(unknown.expectsDecision).toBe(false);
		expect(unknown.canBlock).toBe(false);
		expect(unknown.defaultTimeoutMs).toBe(4000);
	});
});
