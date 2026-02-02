import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import PermissionDialog from './PermissionDialog.js';
import {type HookEventDisplay} from '../types/hooks/display.js';

function makePermissionEvent(
	toolName: string,
	toolInput: Record<string, unknown> = {},
): HookEventDisplay {
	return {
		id: 'test-id',
		requestId: 'req-123',
		timestamp: new Date('2025-01-01T12:00:00'),
		hookName: 'PreToolUse',
		toolName,
		payload: {
			session_id: 'sess-1',
			transcript_path: '/path',
			cwd: '/project',
			hook_event_name: 'PreToolUse' as const,
			tool_name: toolName,
			tool_input: toolInput,
		},
		status: 'pending',
	};
}

describe('PermissionDialog', () => {
	it('renders tool name', () => {
		const event = makePermissionEvent('Bash', {command: 'ls -la'});
		const {lastFrame} = render(
			<PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
		);

		expect(lastFrame()).toContain('Bash');
	});

	it('renders tool input preview', () => {
		const event = makePermissionEvent('Bash', {command: 'ls -la'});
		const {lastFrame} = render(
			<PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
		);

		expect(lastFrame()).toContain('ls -la');
	});

	it('renders all four options', () => {
		const event = makePermissionEvent('Bash');
		const {lastFrame} = render(
			<PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
		);

		const frame = lastFrame() ?? '';
		expect(frame).toContain('Allow');
		expect(frame).toContain('Deny');
		expect(frame).toContain('Always allow');
		expect(frame).toContain('Always deny');
	});

	it('shows queue count when > 0', () => {
		const event = makePermissionEvent('Bash');
		const {lastFrame} = render(
			<PermissionDialog request={event} queuedCount={2} onDecision={vi.fn()} />,
		);

		expect(lastFrame()).toContain('2 more');
	});

	it('does not show queue count when 0', () => {
		const event = makePermissionEvent('Bash');
		const {lastFrame} = render(
			<PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
		);

		expect(lastFrame()).not.toContain('more');
	});
});
