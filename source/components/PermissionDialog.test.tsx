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
	describe('title', () => {
		it('shows "Allow "{tool}"?" for built-in tools', () => {
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('Allow "Edit"?');
		});

		it('shows "Allow "{tool}" ({server})?" for MCP tools', () => {
			const event = makePermissionEvent('mcp__agent-web-interface__click', {
				eid: 'btn-1',
			});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			const frame = lastFrame() ?? '';
			expect(frame).toContain('Allow "click" (agent-web-interface (MCP))?');
		});
	});

	describe('option list rendering', () => {
		it('shows Allow, Deny, Always allow for built-in tools', () => {
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			const frame = lastFrame() ?? '';
			expect(frame).toContain('Allow');
			expect(frame).toContain('Deny');
			expect(frame).toContain('Always allow "Edit"');
			expect(frame).not.toContain('Always deny');
		});

		it('shows "Always allow all from server" option for MCP tools', () => {
			const event = makePermissionEvent('mcp__my-server__action', {});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('Always allow all from my-server (MCP)');
		});

		it('does not show server option for built-in tools', () => {
			const event = makePermissionEvent('Bash', {command: 'ls'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).not.toContain('Always allow all from');
		});

		it('shows type-to-confirm for DESTRUCTIVE tier', () => {
			const event = makePermissionEvent('Bash', {command: 'rm -rf /'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			const frame = lastFrame() ?? '';
			expect(frame).toContain('Type');
			expect(frame).toContain('yes');
		});

		it('shows footer hint for non-destructive tools', () => {
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('Navigate');
			expect(lastFrame()).toContain('Jump');
			expect(lastFrame()).toContain('Select');
			expect(lastFrame()).toContain('Cancel');
		});

		it('does not show "Show details" option', () => {
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).not.toContain('Show details');
		});
	});

	describe('queue count', () => {
		it('shows +N when queue > 0', () => {
			const event = makePermissionEvent('Bash', {command: 'ls'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={2}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('+2');
		});

		it('does not show queue count when 0', () => {
			const event = makePermissionEvent('Bash', {command: 'ls'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).not.toContain('+');
		});
	});

	describe('keyboard interaction', () => {
		it('calls onDecision with "allow" when Enter is pressed on focused Allow option', () => {
			const onDecision = vi.fn();
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {stdin} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={onDecision}
				/>,
			);

			stdin.write('\r');
			expect(onDecision).toHaveBeenCalledWith('allow');
		});

		it('calls onDecision with "deny" via number key', () => {
			const onDecision = vi.fn();
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {stdin} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={onDecision}
				/>,
			);

			stdin.write('2');
			expect(onDecision).toHaveBeenCalledWith('deny');
		});

		it('calls onDecision with "deny" when Escape is pressed', () => {
			const onDecision = vi.fn();
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {stdin} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={onDecision}
				/>,
			);
			stdin.write('\x1B');
			expect(onDecision).toHaveBeenCalledWith('deny');
		});

		it('calls onDecision with "always-allow" via number key', () => {
			const onDecision = vi.fn();
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {stdin} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={onDecision}
				/>,
			);

			stdin.write('3');
			expect(onDecision).toHaveBeenCalledWith('always-allow');
		});

		it('does not show option descriptions', () => {
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).not.toContain('Allow this tool call');
		});
	});
});
