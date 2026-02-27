import {describe, it, expect} from 'vitest';
import {getStatusBadge, type HeaderStatus} from './statusBadge';

describe('getStatusBadge', () => {
	it('returns colored glyph + label when hasColor is true', () => {
		const badge = getStatusBadge('active', true);
		expect(badge).toContain('ACTIVE');
		expect(badge).toContain('◉');
	});

	it('returns text-only fallback when hasColor is false', () => {
		expect(getStatusBadge('active', false)).toBe('[ACTIVE]');
		expect(getStatusBadge('idle', false)).toBe('[IDLE]');
		expect(getStatusBadge('error', false)).toBe('[ERROR]');
		expect(getStatusBadge('stopped', false)).toBe('[STOPPED]');
	});

	it('appends error reason when status is error', () => {
		const badge = getStatusBadge('error', false, 'Permission denied');
		expect(badge).toBe('[ERROR  Permission denied]');

		const colorBadge = getStatusBadge('error', true, 'Timeout');
		expect(colorBadge).toContain('ERROR');
		expect(colorBadge).toContain('Timeout');
	});

	it('ignores error reason for non-error statuses', () => {
		const badge = getStatusBadge('active', false, 'some reason');
		expect(badge).toBe('[ACTIVE]');
	});

	it('all statuses produce non-empty output', () => {
		const statuses: HeaderStatus[] = ['active', 'idle', 'error', 'stopped'];
		for (const s of statuses) {
			expect(getStatusBadge(s, true).length).toBeGreaterThan(0);
			expect(getStatusBadge(s, false).length).toBeGreaterThan(0);
		}
	});
});
