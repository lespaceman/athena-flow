import {describe, it, expect} from 'vitest';
import {detectHarness} from '../shared/utils/detectHarness';

describe('detectHarness', () => {
	it('returns "Claude Code" as the default harness', () => {
		expect(detectHarness()).toBe('Claude Code');
	});
});
