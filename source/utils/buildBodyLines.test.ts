import {describe, expect, it} from 'vitest';
import {opCategory} from './buildBodyLines.js';

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
