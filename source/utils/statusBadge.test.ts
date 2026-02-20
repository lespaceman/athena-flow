import {describe, it, expect} from 'vitest';
import {getStatusBadge, type HeaderStatus} from './statusBadge.js';

describe('getStatusBadge', () => {
	it('returns colored glyph + label when hasColor is true', () => {
		const badge = getStatusBadge('running', true);
		expect(badge).toContain('RUNNING');
		expect(badge).toContain('●');
	});

	it('returns text-only fallback when hasColor is false', () => {
		expect(getStatusBadge('running', false)).toBe('[RUN]');
		expect(getStatusBadge('succeeded', false)).toBe('[OK]');
		expect(getStatusBadge('failed', false)).toBe('[FAIL]');
		expect(getStatusBadge('stopped', false)).toBe('[STOP]');
		expect(getStatusBadge('idle', false)).toBe('[IDLE]');
	});

	it('all statuses produce non-empty output', () => {
		const statuses: HeaderStatus[] = [
			'running',
			'succeeded',
			'failed',
			'stopped',
			'idle',
		];
		for (const s of statuses) {
			expect(getStatusBadge(s, true).length).toBeGreaterThan(0);
			expect(getStatusBadge(s, false).length).toBeGreaterThan(0);
		}
	});
});
