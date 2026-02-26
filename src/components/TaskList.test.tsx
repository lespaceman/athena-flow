import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import TaskList from './TaskList.js';
import {type TodoItem} from '../types/todo.js';

describe('TaskList', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const baseTasks: TodoItem[] = [
		{content: 'Setup environment', status: 'completed'},
		{content: 'Fetch data from API', status: 'completed'},
		{
			content: 'Processing records',
			status: 'in_progress',
			activeForm: 'Processing records...',
		},
		{content: 'Generate report', status: 'pending'},
		{content: 'Cleanup', status: 'pending'},
	];

	it('renders header with progress counter and all task items', () => {
		const {lastFrame} = render(<TaskList tasks={baseTasks} />);
		const frame = lastFrame() ?? '';

		// Header
		expect(frame).toContain('Tasks');
		expect(frame).toContain('2/5');

		// Task items
		expect(frame).toContain('Setup environment');
		expect(frame).toContain('Fetch data from API');
		expect(frame).toContain('Processing records');
		expect(frame).toContain('Generate report');
		expect(frame).toContain('Cleanup');

		// State symbols
		expect(frame).toContain('✓'); // completed
		expect(frame).toContain('·'); // pending
	});

	it('renders collapsed view with toggle indicator and current task', () => {
		const {lastFrame} = render(<TaskList tasks={baseTasks} collapsed />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('▶');
		expect(frame).toContain('Tasks');
		expect(frame).toContain('2/5');
		expect(frame).toContain('Processing records');

		// Should NOT show individual task items in collapsed mode
		expect(frame).not.toContain('Setup environment');
		expect(frame).not.toContain('Cleanup');
	});

	it('renders expanded view with toggle indicator', () => {
		const {lastFrame} = render(
			<TaskList tasks={baseTasks} collapsed={false} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('▼');
	});

	it('shows "Done" when all tasks completed in collapsed view', () => {
		const allDone: TodoItem[] = [
			{content: 'Step 1', status: 'completed'},
			{content: 'Step 2', status: 'completed'},
		];
		const {lastFrame} = render(<TaskList tasks={allDone} collapsed />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('2/2');
		expect(frame).toContain('✓');
		expect(frame).toContain('Done');
	});

	it('shows failed state with cross symbol and error text', () => {
		const withFailed: TodoItem[] = [
			{content: 'Setup', status: 'completed'},
			{content: 'Process records', status: 'failed'},
			{content: 'Report', status: 'pending'},
		];
		const {lastFrame} = render(<TaskList tasks={withFailed} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('✗');
		expect(frame).toContain('Process records');
		expect(frame).toContain('failed');
	});

	it('shows failed state in collapsed view', () => {
		const withFailed: TodoItem[] = [
			{content: 'Setup', status: 'completed'},
			{content: 'Process records', status: 'failed'},
			{content: 'Report', status: 'pending'},
		];
		const {lastFrame} = render(<TaskList tasks={withFailed} collapsed />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('✗');
		expect(frame).toContain('Failed');
		expect(frame).toContain('Process records');
	});

	it('renders nothing when task list is empty', () => {
		const {lastFrame} = render(<TaskList tasks={[]} />);
		expect(lastFrame()).toBe('');
	});

	it('handles single task', () => {
		const single: TodoItem[] = [{content: 'Only task', status: 'in_progress'}];
		const {lastFrame} = render(<TaskList tasks={single} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('0/1');
		expect(frame).toContain('Only task');
	});

	it('calls onToggle on Ctrl+t', () => {
		const onToggle = vi.fn();
		const {stdin} = render(<TaskList tasks={baseTasks} onToggle={onToggle} />);

		// Ctrl+t = ASCII 0x14
		stdin.write('\x14');
		expect(onToggle).toHaveBeenCalled();
	});

	it('does not call onToggle when dialogActive is true', () => {
		const onToggle = vi.fn();
		const {stdin} = render(
			<TaskList tasks={baseTasks} onToggle={onToggle} dialogActive />,
		);

		stdin.write('\x14'); // Ctrl+t
		expect(onToggle).not.toHaveBeenCalled();
	});

	it('does not toggle on plain "t" keypress', () => {
		const onToggle = vi.fn();
		const {stdin} = render(<TaskList tasks={baseTasks} onToggle={onToggle} />);

		stdin.write('t');
		expect(onToggle).not.toHaveBeenCalled();
	});

	it('shows activeForm text for in-progress tasks in expanded view', () => {
		const {lastFrame} = render(<TaskList tasks={baseTasks} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Processing records...');
	});

	it('uses activeForm in collapsed view when available', () => {
		const {lastFrame} = render(<TaskList tasks={baseTasks} collapsed />);
		const frame = lastFrame() ?? '';

		// Should prefer activeForm over content in collapsed status
		expect(frame).toContain('Processing records...');
	});

	it('falls back to content when activeForm is not set in collapsed view', () => {
		const noActiveForm: TodoItem[] = [
			{content: 'Setup', status: 'completed'},
			{content: 'Build project', status: 'in_progress'},
		];
		const {lastFrame} = render(<TaskList tasks={noActiveForm} collapsed />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Build project');
	});
});
