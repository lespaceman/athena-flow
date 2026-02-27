import {vi} from 'vitest';

vi.hoisted(() => {
	process.env['FORCE_COLOR'] = '1';
});

import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import SessionPicker from './SessionPicker';
import {type SessionEntry} from '../utils/sessionIndex';
import {formatRelativeTime} from '../utils/formatters';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const sessions: SessionEntry[] = [
	{
		sessionId: 'aaa',
		summary: 'Terminal UI Development',
		firstPrompt: 'is npm run dev working',
		modified: new Date(Date.now() - 3600_000).toISOString(),
		created: '2026-01-24T22:45:49.288Z',
		gitBranch: 'main',
		messageCount: 20,
	},
	{
		sessionId: 'bbb',
		summary: 'Hook-Forwarder Security Fixes',
		firstPrompt: 'fix the security issue',
		modified: new Date(Date.now() - 7200_000).toISOString(),
		created: '2026-01-24T23:03:02.886Z',
		gitBranch: 'feature/hook-forwarder',
		messageCount: 18,
	},
	{
		sessionId: 'ccc',
		summary: '',
		firstPrompt: 'API key auth error',
		modified: new Date(Date.now() - 18000_000).toISOString(),
		created: '2026-01-25T00:01:13.007Z',
		gitBranch: '',
		messageCount: 2,
	},
];

describe('SessionPicker', () => {
	it('renders session summaries', () => {
		const {lastFrame} = render(
			<SessionPicker
				sessions={sessions}
				onSelect={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Terminal UI Development');
		expect(frame).toContain('Hook-Forwarder Security Fixes');
	});

	it('falls back to firstPrompt when summary is empty', () => {
		const {lastFrame} = render(
			<SessionPicker
				sessions={sessions}
				onSelect={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('API key auth error');
	});

	it('shows branch, relative time, and message count', () => {
		const {lastFrame} = render(
			<SessionPicker
				sessions={sessions}
				onSelect={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('main');
		expect(frame).toContain('20 messages');
	});

	it('shows "no branch" for empty gitBranch', () => {
		const {lastFrame} = render(
			<SessionPicker
				sessions={sessions}
				onSelect={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('no branch');
	});

	it('shows empty state message when no sessions', () => {
		const {lastFrame} = render(
			<SessionPicker sessions={[]} onSelect={vi.fn()} onCancel={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('No previous sessions found');
	});

	it('calls onSelect with sessionId on Enter', () => {
		const onSelect = vi.fn();
		const {stdin} = render(
			<SessionPicker
				sessions={sessions}
				onSelect={onSelect}
				onCancel={vi.fn()}
			/>,
		);
		stdin.write('\r');
		expect(onSelect).toHaveBeenCalledWith('aaa');
	});

	it('navigates down and selects correct session', async () => {
		const onSelect = vi.fn();
		const {stdin} = render(
			<SessionPicker
				sessions={sessions}
				onSelect={onSelect}
				onCancel={vi.fn()}
			/>,
		);
		stdin.write('\x1B[B');
		await delay(50);
		stdin.write('\r');
		expect(onSelect).toHaveBeenCalledWith('bbb');
	});

	it('calls onCancel on Escape', () => {
		const onCancel = vi.fn();
		const {stdin} = render(
			<SessionPicker
				sessions={sessions}
				onSelect={vi.fn()}
				onCancel={onCancel}
			/>,
		);
		stdin.write('\x1B');
		expect(onCancel).toHaveBeenCalled();
	});

	it('does not scroll past the last item', async () => {
		const onSelect = vi.fn();
		const {stdin} = render(
			<SessionPicker
				sessions={sessions}
				onSelect={onSelect}
				onCancel={vi.fn()}
			/>,
		);
		// Press down 5 times (past the 3 items)
		for (let i = 0; i < 5; i++) {
			stdin.write('\x1B[B');
			await delay(20);
		}
		stdin.write('\r');
		expect(onSelect).toHaveBeenCalledWith('ccc');
	});

	it('shows keybinding hints', () => {
		const {lastFrame} = render(
			<SessionPicker
				sessions={sessions}
				onSelect={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Navigate');
		expect(frame).toContain('Select');
		expect(frame).toContain('Cancel');
	});
});

describe('formatRelativeTime', () => {
	it('formats recent times', () => {
		expect(formatRelativeTime(new Date().toISOString())).toBe('just now');
		expect(
			formatRelativeTime(new Date(Date.now() - 5 * 60_000).toISOString()),
		).toBe('5m ago');
		expect(
			formatRelativeTime(new Date(Date.now() - 3 * 3600_000).toISOString()),
		).toBe('3h ago');
		expect(
			formatRelativeTime(new Date(Date.now() - 2 * 86400_000).toISOString()),
		).toBe('2d ago');
	});
});
