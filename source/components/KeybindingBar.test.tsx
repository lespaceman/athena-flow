import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import KeybindingBar from './KeybindingBar.js';

describe('KeybindingBar', () => {
	it('renders all keybinding letters', () => {
		const {lastFrame} = render(<KeybindingBar toolName="Bash" />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('a');
		expect(frame).toContain('d');
		expect(frame).toContain('A');
		expect(frame).toContain('D');
	});

	it('shows "(default)" indicator', () => {
		const {lastFrame} = render(<KeybindingBar toolName="Bash" />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('(default)');
	});

	it('includes tool name in "always" options', () => {
		const {lastFrame} = render(<KeybindingBar toolName="Write" />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Always allow "Write"');
		expect(frame).toContain('Always deny "Write"');
	});

	it('includes server label when provided', () => {
		const {lastFrame} = render(
			<KeybindingBar toolName="fetch" serverLabel="mcp-server" />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Always allow "fetch" on mcp-server');
		expect(frame).toContain('Always deny "fetch" on mcp-server');
	});

	it('renders line 1 labels without redundant Details', () => {
		const {lastFrame} = render(<KeybindingBar toolName="Bash" />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Allow');
		expect(frame).toContain('Deny');
		expect(frame).not.toContain('Details');
	});

	it('shows Escape hint', () => {
		const {lastFrame} = render(<KeybindingBar toolName="Bash" />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Esc');
		expect(frame).toContain('Cancel');
	});

	it('shows separator between single-action and persistent keybindings', () => {
		const {lastFrame} = render(<KeybindingBar toolName="Bash" />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Persistent:');
	});
});
