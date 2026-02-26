import React from 'react';
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
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

	describe('column alignment', () => {
		const mixedCommands: Command[] = [
			makeCommand('h', 'Short name'),
			makeCommand('explore-website', 'Longer name'),
		];

		it('aligns descriptions to same column regardless of name length', () => {
			const {lastFrame} = render(
				<CommandSuggestions commands={mixedCommands} selectedIndex={0} />,
			);
			const frame = lastFrame() ?? '';
			const lines = frame.split('\n').filter(l => l.includes('/'));

			// Both descriptions should start at the same column
			const descStart = (line: string, desc: string) => line.indexOf(desc);
			const pos0 = descStart(lines[0]!, 'Short name');
			const pos1 = descStart(lines[1]!, 'Longer name');
			expect(pos0).toBe(pos1);
		});
	});

	describe('description truncation', () => {
		let originalColumns: number | undefined;

		beforeEach(() => {
			originalColumns = process.stdout.columns;
		});

		afterEach(() => {
			Object.defineProperty(process.stdout, 'columns', {
				value: originalColumns,
				writable: true,
				configurable: true,
			});
		});

		it('truncates long descriptions with ellipsis in narrow terminals', () => {
			Object.defineProperty(process.stdout, 'columns', {
				value: 40,
				writable: true,
				configurable: true,
			});

			const longDesc =
				'This is a very long description that should be truncated';
			const cmds: Command[] = [makeCommand('test', longDesc)];
			const {lastFrame} = render(
				<CommandSuggestions commands={cmds} selectedIndex={0} />,
			);
			const frame = lastFrame() ?? '';
			expect(frame).toContain('\u2026');
			expect(frame).not.toContain(longDesc);
		});

		it('does not truncate short descriptions', () => {
			Object.defineProperty(process.stdout, 'columns', {
				value: 120,
				writable: true,
				configurable: true,
			});

			const cmds: Command[] = [makeCommand('test', 'Short desc')];
			const {lastFrame} = render(
				<CommandSuggestions commands={cmds} selectedIndex={0} />,
			);
			const frame = lastFrame() ?? '';
			expect(frame).toContain('Short desc');
			expect(frame).not.toContain('\u2026');
		});
	});
});
