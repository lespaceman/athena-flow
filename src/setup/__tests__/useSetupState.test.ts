/** @vitest-environment jsdom */
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useSetupState} from '../useSetupState.js';

describe('useSetupState', () => {
	it('starts at step 0 in selecting state', () => {
		const {result} = renderHook(() => useSetupState());
		expect(result.current.stepIndex).toBe(0);
		expect(result.current.stepState).toBe('selecting');
	});

	it('transitions to verifying then success', () => {
		const {result} = renderHook(() => useSetupState());
		act(() => result.current.startVerifying());
		expect(result.current.stepState).toBe('verifying');
		act(() => result.current.markSuccess());
		expect(result.current.stepState).toBe('success');
	});

	it('advances to next step', () => {
		const {result} = renderHook(() => useSetupState());
		act(() => result.current.startVerifying());
		act(() => result.current.markSuccess());
		act(() => result.current.advance());
		expect(result.current.stepIndex).toBe(1);
		expect(result.current.stepState).toBe('selecting');
	});

	it('retreats to previous step and resets selecting state', () => {
		const {result} = renderHook(() => useSetupState());
		act(() => {
			result.current.markSuccess();
			result.current.advance();
		});
		expect(result.current.stepIndex).toBe(1);
		act(() => {
			result.current.markError();
			result.current.retreat();
		});
		expect(result.current.stepIndex).toBe(0);
		expect(result.current.stepState).toBe('selecting');
	});

	it('transitions to error and allows retry', () => {
		const {result} = renderHook(() => useSetupState());
		act(() => result.current.startVerifying());
		act(() => result.current.markError());
		expect(result.current.stepState).toBe('error');
		act(() => result.current.retry());
		expect(result.current.stepState).toBe('selecting');
	});

	it('reports isComplete when past last step', () => {
		const {result} = renderHook(() => useSetupState());
		// Step 0
		act(() => {
			result.current.startVerifying();
			result.current.markSuccess();
			result.current.advance();
		});
		// Step 1
		act(() => {
			result.current.startVerifying();
			result.current.markSuccess();
			result.current.advance();
		});
		// Step 2
		act(() => {
			result.current.startVerifying();
			result.current.markSuccess();
			result.current.advance();
		});
		expect(result.current.isComplete).toBe(true);
	});
});
