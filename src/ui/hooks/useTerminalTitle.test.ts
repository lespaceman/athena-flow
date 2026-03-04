/**
 * @vitest-environment jsdom
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {renderHook} from '@testing-library/react';
import type {FeedEvent} from '../../core/feed/types';

// Capture stdout.write calls via the Ink useStdout mock.
const mockWrite = vi.fn();
const mockStdout = {write: mockWrite};

vi.mock('ink', () => ({
	useStdout: () => ({stdout: mockStdout}),
}));

// Import after mock is in place.
const {useTerminalTitle} = await import('./useTerminalTitle');

function makePromptEvent(prompt: string, seq = 1): FeedEvent {
	return {
		kind: 'user.prompt',
		seq,
		ts: Date.now(),
		collapsed: false,
		data: {prompt, cwd: '/tmp'},
	} as FeedEvent;
}

describe('useTerminalTitle', () => {
	beforeEach(() => {
		mockWrite.mockClear();
	});

	it('sets base title when no feed events exist', () => {
		renderHook(() => useTerminalTitle([], false));
		expect(mockWrite).toHaveBeenCalledWith('\x1b]0;Athena Flow\x07');
	});

	it('includes first user prompt in title', () => {
		const events = [makePromptEvent('fix the login bug')];
		renderHook(() => useTerminalTitle(events, false));
		expect(mockWrite).toHaveBeenCalledWith(
			'\x1b]0;Athena Flow - fix the login bug\x07',
		);
	});

	it('prefixes * when harness is running', () => {
		const events = [makePromptEvent('fix the login bug')];
		renderHook(() => useTerminalTitle(events, true));
		expect(mockWrite).toHaveBeenCalledWith(
			'\x1b]0;* Athena Flow - fix the login bug\x07',
		);
	});

	it('clears * prefix when harness stops', () => {
		const events = [makePromptEvent('fix it')];
		const {rerender} = renderHook(
			({running}) => useTerminalTitle(events, running),
			{initialProps: {running: true}},
		);
		mockWrite.mockClear();
		rerender({running: false});
		expect(mockWrite).toHaveBeenCalledWith(
			'\x1b]0;Athena Flow - fix it\x07',
		);
	});

	it('truncates long prompts', () => {
		const long = 'a'.repeat(100);
		const events = [makePromptEvent(long)];
		renderHook(() => useTerminalTitle(events, false));

		const written = mockWrite.mock.calls[0]?.[0] as string;
		// Strip OSC wrapper to get the title content.
		const title = written.replace('\x1b]0;', '').replace('\x07', '');
		expect(title.length).toBeLessThanOrEqual('Athena Flow - '.length + 50);
		expect(title).toContain('...');
	});

	it('does not write when title has not changed', () => {
		const events = [makePromptEvent('hello')];
		const {rerender} = renderHook(
			({ev, running}) => useTerminalTitle(ev, running),
			{initialProps: {ev: events, running: false}},
		);
		mockWrite.mockClear();
		// Re-render with identical values — should skip the write.
		rerender({ev: events, running: false});
		expect(mockWrite).not.toHaveBeenCalled();
	});

	it('restores empty title on unmount', () => {
		const {unmount} = renderHook(() => useTerminalTitle([], false));
		mockWrite.mockClear();
		unmount();
		expect(mockWrite).toHaveBeenCalledWith('\x1b]0;\x07');
	});
});
