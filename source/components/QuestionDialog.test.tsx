import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import QuestionDialog from './QuestionDialog.js';
import type {HookEventDisplay, PreToolUseEvent} from '../types/hooks/index.js';

function makeRequest(
	questions: Array<{
		question: string;
		header: string;
		options: Array<{label: string; description: string}>;
		multiSelect: boolean;
	}>,
): HookEventDisplay {
	const payload: PreToolUseEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PreToolUse',
		tool_name: 'AskUserQuestion',
		tool_input: {questions},
	};

	return {
		id: 'test-q-1',
		timestamp: new Date('2024-01-15T10:30:45.000Z'),
		hookName: 'PreToolUse',
		toolName: 'AskUserQuestion',
		payload,
		status: 'pending',
	};
}

describe('QuestionDialog', () => {
	it('renders question header and text', () => {
		const request = makeRequest([
			{
				question: 'Which library should we use?',
				header: 'Library',
				options: [
					{label: 'React', description: 'Popular UI library'},
					{label: 'Vue', description: 'Progressive framework'},
				],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('[Library]');
		expect(frame).toContain('Which library should we use?');
	});

	it('shows short option labels for all options', () => {
		const request = makeRequest([
			{
				question: 'Which library?',
				header: 'Library',
				options: [
					{label: 'React', description: 'Popular UI library'},
					{label: 'Vue', description: 'Progressive framework'},
				],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('React');
		expect(frame).toContain('Vue');
	});

	it('shows description only for focused option (first by default)', () => {
		const request = makeRequest([
			{
				question: 'Which library?',
				header: 'Library',
				options: [
					{label: 'React', description: 'Popular UI library'},
					{label: 'Vue', description: 'Progressive framework'},
				],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		// Focused option description visible
		expect(frame).toContain('Popular UI library');
		// Non-focused description hidden
		expect(frame).not.toContain('Progressive framework');
	});

	it('renders Other option with clarifier description', () => {
		const request = makeRequest([
			{
				question: 'Which library?',
				header: 'Library',
				options: [{label: 'React', description: 'UI lib'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Other');
	});

	it('renders keybinding hints for single-select', () => {
		const request = makeRequest([
			{
				question: 'Question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Navigate');
		expect(frame).toContain('Select');
		expect(frame).toContain('Skip');
	});

	it('renders keybinding hints for multi-select', () => {
		const request = makeRequest([
			{
				question: 'Which features?',
				header: 'Features',
				options: [{label: 'Auth', description: 'Authentication'}],
				multiSelect: true,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Toggle');
		expect(frame).toContain('Submit');
	});

	it('shows tab headers when multiple questions', () => {
		const request = makeRequest([
			{
				question: 'First question?',
				header: 'Q1',
				options: [{label: 'A', description: 'Option A'}],
				multiSelect: false,
			},
			{
				question: 'Second question?',
				header: 'Q2',
				options: [{label: 'B', description: 'Option B'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('[1. Q1]');
		expect(frame).toContain('2. Q2');
	});

	it('does not show tabs for single question', () => {
		const request = makeRequest([
			{
				question: 'Only question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('1.');
	});

	it('shows queued count when more questions are queued', () => {
		const request = makeRequest([
			{
				question: 'Question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={2}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('(2 more queued)');
	});

	it('shows message when no questions found', () => {
		const payload: PreToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PreToolUse',
			tool_name: 'AskUserQuestion',
			tool_input: {},
		};

		const request: HookEventDisplay = {
			id: 'test-q-empty',
			timestamp: new Date('2024-01-15T10:30:45.000Z'),
			hookName: 'PreToolUse',
			toolName: 'AskUserQuestion',
			payload,
			status: 'pending',
		};

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('No questions found');
	});

	it('renders with dashed separator instead of border', () => {
		const request = makeRequest([
			{
				question: 'Question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		// Dashed separator at top, no border box
		expect(frame).toContain('╌');
		expect(frame).not.toContain('\u256d'); // no ╭
		expect(frame).not.toContain('\u256f'); // no ╯
	});

	it('calls onSkip when Esc is pressed', () => {
		const onSkip = vi.fn();
		const request = makeRequest([
			{
				question: 'Question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {stdin} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={onSkip}
			/>,
		);

		// Press Escape
		stdin.write('\x1B');

		expect(onSkip).toHaveBeenCalled();
	});
});
