/** @vitest-environment jsdom */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useTodoPanel} from './useTodoPanel.js';
import {type TodoItem} from '../types/todo.js';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

function makeTasks(statuses: TodoItem['status'][]): TodoItem[] {
	return statuses.map((status, i) => ({
		id: `task-${i}`,
		content: `Task ${i}`,
		status,
	}));
}

describe('useTodoPanel', () => {
	describe('elapsed times', () => {
		it('doing items produce elapsed after tick', () => {
			const tasks = makeTasks(['in_progress']);
			const {result} = renderHook(() => useTodoPanel({tasks}));

			// Initially elapsed should be "0s" (just started)
			expect(result.current.todoItems[0]!.elapsed).toBe('0s');

			// Advance 5 seconds
			act(() => {
				vi.advanceTimersByTime(5000);
			});

			expect(result.current.todoItems[0]!.elapsed).toBe('5s');
		});

		it('completed items retain their elapsed time', () => {
			// Start with a doing task
			const tasks = makeTasks(['in_progress']);
			const {result, rerender} = renderHook(
				({tasks}: {tasks: TodoItem[]}) => useTodoPanel({tasks}),
				{initialProps: {tasks}},
			);

			// Advance 10 seconds while doing
			act(() => {
				vi.advanceTimersByTime(10_000);
			});

			// Now mark as completed
			const completedTasks = makeTasks(['completed']);
			rerender({tasks: completedTasks});

			expect(result.current.todoItems[0]!.elapsed).toBe('10s');
		});
	});

	describe('auto-scroll', () => {
		it('keeps active and next pending item within visible window', () => {
			// 6 tasks: first 3 done, 4th doing, 5th+6th pending
			const tasks = makeTasks([
				'completed',
				'completed',
				'completed',
				'in_progress',
				'pending',
				'pending',
			]);
			const {result} = renderHook(() => useTodoPanel({tasks}));

			// activeIdx=3, lastMustSee=4. With maxVisible=3, scroll should be 2
			// so visible window is [2,3,4] which includes both active(3) and next(4)
			expect(result.current.todoScroll).toBe(2);
		});
	});
});
