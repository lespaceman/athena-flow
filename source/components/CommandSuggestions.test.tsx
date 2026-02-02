import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import CommandSuggestions from './CommandSuggestions.js';
import {type Command} from '../commands/types.js';

const makeCommand = (name: string, description: string): Command => ({
	name,
	description,
	category: 'ui',
	execute: () => {},
});

describe('CommandSuggestions', () => {
	const commands: Command[] = [
		makeCommand('help', 'Show available commands'),
		makeCommand('clear', 'Clear the screen'),
		makeCommand('quit', 'Exit athena-cli'),
	];

	it('returns null when commands list is empty', () => {
		const {lastFrame} = render(
			<CommandSuggestions commands={[]} selectedIndex={0} />,
		);
		expect(lastFrame()).toBe('');
	});

	it('renders all command names with / prefix', () => {
		const {lastFrame} = render(
			<CommandSuggestions commands={commands} selectedIndex={0} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('/help');
		expect(frame).toContain('/clear');
		expect(frame).toContain('/quit');
	});

	it('renders command descriptions', () => {
		const {lastFrame} = render(
			<CommandSuggestions commands={commands} selectedIndex={0} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Show available commands');
		expect(frame).toContain('Clear the screen');
		expect(frame).toContain('Exit athena-cli');
	});

	it('shows > indicator on selected item', () => {
		const {lastFrame} = render(
			<CommandSuggestions commands={commands} selectedIndex={1} />,
		);
		const frame = lastFrame() ?? '';
		const lines = frame.split('\n');

		// Line at index 1 (second command) should have > indicator
		const clearLine = lines.find(l => l.includes('/clear'));
		expect(clearLine).toContain('>');

		// Other lines should not have > indicator (they have space instead)
		const helpLine = lines.find(l => l.includes('/help'));
		expect(helpLine).not.toContain('>');
	});

	it('highlights selected item differently from unselected', () => {
		const {lastFrame} = render(
			<CommandSuggestions commands={commands} selectedIndex={0} />,
		);
		const frame = lastFrame() ?? '';
		// Selected item (help) should have > indicator
		const lines = frame.split('\n');
		const helpLine = lines.find(l => l.includes('/help'));
		expect(helpLine).toContain('>');
	});
});
