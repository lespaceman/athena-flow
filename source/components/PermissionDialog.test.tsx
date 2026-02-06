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
	describe('risk tier badge', () => {
		it('shows DESTRUCTIVE badge for Bash tool with destructive command', () => {
			const event = makePermissionEvent('Bash', {command: 'rm -rf /tmp'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('[DESTRUCTIVE]');
		});

		it('shows READ badge for Bash tool with read-only command', () => {
			const event = makePermissionEvent('Bash', {command: 'ls -la'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('[READ]');
		});

		it('shows WRITE badge for Edit tool', () => {
			const event = makePermissionEvent('Edit', {
				file_path: '/test.ts',
				old_string: 'foo',
				new_string: 'bar',
			});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('[WRITE]');
		});

		it('shows READ badge for Grep tool', () => {
			const event = makePermissionEvent('Grep', {pattern: 'test'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('[READ]');
		});
	});

	describe('tool name parsing', () => {
		it('shows parsed tool name for MCP tools', () => {
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
			// Should show the action name "click" not the full raw name
			expect(frame).toContain('click');
			// Should show server label
			expect(frame).toContain('agent-web-interface (MCP)');
		});

		it('shows built-in tool name directly', () => {
			const event = makePermissionEvent('Bash', {command: 'ls'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('Bash');
		});
	});

	describe('args formatting', () => {
		it('shows "(none)" for empty args', () => {
			const event = makePermissionEvent('Bash', {});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('(none)');
		});

		it('shows formatted args', () => {
			const event = makePermissionEvent('Edit', {
				file_path: '/test.ts',
				old_string: 'foo',
				new_string: 'bar',
			});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			const frame = lastFrame() ?? '';
			expect(frame).toContain('file_path: "/test.ts"');
			expect(frame).toContain('old_string: "foo"');
		});
	});

	describe('keybinding hints', () => {
		it('shows keybinding hints for non-destructive tools', () => {
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			const frame = lastFrame() ?? '';
			// Should show keybinding hints
			expect(frame).toContain('a');
			expect(frame).toContain('Allow');
			expect(frame).toContain('d');
			expect(frame).toContain('Deny');
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
			// Should show type-to-confirm prompt for destructive operations
			expect(frame).toContain('Type');
			expect(frame).toContain('yes');
		});
	});

	describe('queue count', () => {
		it('shows queue count when > 0', () => {
			const event = makePermissionEvent('Bash', {});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={2}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).toContain('2 more');
		});

		it('does not show queue count when 0', () => {
			const event = makePermissionEvent('Bash', {});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			expect(lastFrame()).not.toContain('more');
		});
	});

	describe('raw payload details', () => {
		it('shows collapsed payload hint by default', () => {
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			const frame = lastFrame() ?? '';
			// Should show the collapsed state indicator
			expect(frame).toContain('Show raw payload');
		});
	});

	describe('agent chain context', () => {
		it('shows agent chain when provided with items', () => {
			const event = makePermissionEvent('Bash', {command: 'ls'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
					agentChain={['main', 'web-explorer']}
				/>,
			);

			const frame = lastFrame() ?? '';
			expect(frame).toContain('Context:');
			expect(frame).toContain('main → web-explorer');
		});

		it('does not show agent chain section when prop not provided', () => {
			const event = makePermissionEvent('Bash', {command: 'ls'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
				/>,
			);

			const frame = lastFrame() ?? '';
			// Should not contain the Context label for agent chain
			// (Note: "Context block" is a comment in the code, not rendered text)
			expect(frame).not.toMatch(/Context:\s*\w/);
		});

		it('does not show agent chain section when array is empty', () => {
			const event = makePermissionEvent('Bash', {command: 'ls'});
			const {lastFrame} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={vi.fn()}
					agentChain={[]}
				/>,
			);

			const frame = lastFrame() ?? '';
			expect(frame).not.toMatch(/Context:\s*\w/);
		});
	});

	describe('keyboard interaction', () => {
		it('calls onDecision with "allow" when "a" is pressed', () => {
			const onDecision = vi.fn();
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {stdin} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={onDecision}
				/>,
			);

			stdin.write('a');
			expect(onDecision).toHaveBeenCalledWith('allow');
		});

		it('calls onDecision with "deny" when "d" is pressed', () => {
			const onDecision = vi.fn();
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {stdin} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={onDecision}
				/>,
			);

			stdin.write('d');
			expect(onDecision).toHaveBeenCalledWith('deny');
		});

		it('calls onDecision with "deny" when Enter is pressed', () => {
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
			expect(onDecision).toHaveBeenCalledWith('deny');
		});

		it('calls onDecision with "always-allow" when "A" is pressed', () => {
			const onDecision = vi.fn();
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {stdin} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={onDecision}
				/>,
			);

			stdin.write('A');
			expect(onDecision).toHaveBeenCalledWith('always-allow');
		});

		it('calls onDecision with "always-deny" when "D" is pressed', () => {
			const onDecision = vi.fn();
			const event = makePermissionEvent('Edit', {file_path: '/test.ts'});
			const {stdin} = render(
				<PermissionDialog
					request={event}
					queuedCount={0}
					onDecision={onDecision}
				/>,
			);

			stdin.write('D');
			expect(onDecision).toHaveBeenCalledWith('always-deny');
		});
	});
});
