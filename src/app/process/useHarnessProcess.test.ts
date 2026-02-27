/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useHarnessProcess} from './useHarnessProcess';

describe('useHarnessProcess', () => {
	it('exposes the neutral process contract', () => {
		const {result} = renderHook(() =>
			useHarnessProcess({
				harness: 'claude-code',
				projectDir: '/tmp/project',
				instanceId: 1,
			}),
		);

		expect(typeof result.current.spawn).toBe('function');
		expect(typeof result.current.interrupt).toBe('function');
		expect(typeof result.current.kill).toBe('function');
		expect(typeof result.current.isRunning).toBe('boolean');
		expect(result.current.usage).toEqual(result.current.tokenUsage);
	});
});
