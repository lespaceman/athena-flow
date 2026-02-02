import React from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render} from 'ink-testing-library';
import CommandInput from './CommandInput.js';
import * as registryModule from '../commands/registry.js';

// Register test commands before each test
beforeEach(() => {
	registryModule.clear();
	registryModule.register({
		name: 'help',
		description: 'Show help',
		category: 'ui',
		execute: () => {},
	});
	registryModule.register({
		name: 'clear',
		description: 'Clear screen',
		category: 'ui',
		execute: () => {},
	});
	registryModule.register({
		name: 'commit',
		description: 'Commit changes',
		category: 'prompt',
		session: 'new',
		buildPrompt: () => 'commit',
	});
});

afterEach(() => {
	registryModule.clear();
});

// Delay helper to let React process state updates
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('CommandInput', () => {
	it('renders placeholder text', () => {
		const {lastFrame} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Type a message or /command...');
	});

	it('does not show suggestions when input is empty', () => {
		const {lastFrame} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);
		const frame = lastFrame() ?? '';
		// Should not contain command suggestion indicators
		expect(frame).not.toContain('/help');
		expect(frame).not.toContain('/clear');
	});

	it('shows suggestions when / is typed', async () => {
		const {lastFrame, stdin} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);

		stdin.write('/');
		await delay(50);

		const frame = lastFrame() ?? '';
		expect(frame).toContain('/help');
		expect(frame).toContain('/clear');
		expect(frame).toContain('/commit');
	});

	it('filters suggestions by prefix', async () => {
		const {lastFrame, stdin} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);

		stdin.write('/c');
		await delay(50);

		const frame = lastFrame() ?? '';
		expect(frame).toContain('/clear');
		expect(frame).toContain('/commit');
		expect(frame).not.toContain('/help');
	});

	it('hides suggestions after space is typed', async () => {
		const {lastFrame, stdin} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);

		stdin.write('/help ');
		await delay(50);

		const frame = lastFrame() ?? '';
		// Suggestions should be hidden once space is entered
		expect(frame).not.toContain('Show help');
	});

	it('navigates suggestions with down arrow', async () => {
		const {lastFrame, stdin} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);

		// Enter command mode
		stdin.write('/');
		await delay(50);

		// First item should be selected initially (> indicator)
		let frame = lastFrame() ?? '';
		const lines = frame.split('\n');
		const firstCmdLine = lines.find(l => l.includes('/help'));
		expect(firstCmdLine).toContain('>');

		// Press down arrow
		stdin.write('\x1b[B');
		await delay(50);

		// Second item should now be selected
		frame = lastFrame() ?? '';
		const updatedLines = frame.split('\n');
		const secondCmdLine = updatedLines.find(l => l.includes('/clear'));
		expect(secondCmdLine).toContain('>');
	});

	it('wraps around when navigating past last suggestion', async () => {
		const {lastFrame, stdin} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);

		stdin.write('/');
		await delay(50);

		// Press down 3 times (3 commands total) to wrap back to first
		stdin.write('\x1b[B');
		await delay(20);
		stdin.write('\x1b[B');
		await delay(20);
		stdin.write('\x1b[B');
		await delay(50);

		const frame = lastFrame() ?? '';
		const lines = frame.split('\n');
		const helpLine = lines.find(l => l.includes('/help'));
		expect(helpLine).toContain('>');
	});

	it('completes selected command on tab', async () => {
		const {lastFrame, stdin} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);

		// Enter command mode and navigate to second item
		stdin.write('/');
		await delay(50);
		stdin.write('\x1b[B');
		await delay(50);

		// Press tab to complete
		stdin.write('\t');
		await delay(50);

		const frame = lastFrame() ?? '';
		// After tab completion, the input should contain the completed command
		// and suggestions should be hidden (space added after command name)
		expect(frame).toContain('/clear');
	});

	it('calls onSubmit when Enter is pressed', async () => {
		const onSubmit = vi.fn();
		const {stdin} = render(<CommandInput inputKey={0} onSubmit={onSubmit} />);

		stdin.write('hello world');
		await delay(50);
		stdin.write('\r');
		await delay(50);

		expect(onSubmit).toHaveBeenCalledWith('hello world');
	});

	it('clears input after submit via rerender with new inputKey', async () => {
		const onSubmit = vi.fn();
		const {lastFrame, stdin, rerender} = render(
			<CommandInput inputKey={0} onSubmit={onSubmit} />,
		);

		stdin.write('hello');
		await delay(50);
		stdin.write('\r');
		await delay(50);

		// Parent would bump inputKey after submit
		rerender(<CommandInput inputKey={1} onSubmit={onSubmit} />);
		await delay(50);

		const frame = lastFrame() ?? '';
		// Input should show placeholder, not the old value
		expect(frame).toContain('Type a message or /command...');
		expect(frame).not.toContain('hello');
	});

	it('shows all commands including plugin commands when / is typed', async () => {
		// Register extra commands to exceed the old MAX_SUGGESTIONS of 6
		for (let i = 0; i < 8; i++) {
			registryModule.register({
				name: `builtin-${i}`,
				description: `Builtin ${i}`,
				category: 'ui',
				execute: () => {},
			});
		}
		registryModule.register({
			name: 'explore-website',
			description: 'Explore a site',
			category: 'prompt',
			session: 'new' as const,
			buildPrompt: () => 'explore',
		});

		const {lastFrame, stdin} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);

		stdin.write('/');
		await delay(50);

		const frame = lastFrame() ?? '';
		expect(frame).toContain('/explore-website');
	});

	it('dismisses suggestions on Escape', async () => {
		const {lastFrame, stdin} = render(
			<CommandInput inputKey={0} onSubmit={() => {}} />,
		);

		stdin.write('/');
		await delay(50);

		let frame = lastFrame() ?? '';
		expect(frame).toContain('/help');

		// Press Escape
		stdin.write('\x1b');
		await delay(50);

		frame = lastFrame() ?? '';
		expect(frame).not.toContain('/help');
	});
});
