import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import chalk from 'chalk';
import MultiOptionList from './MultiOptionList.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const options = [
	{label: 'Auth', description: 'Authentication system', value: 'auth'},
	{label: 'Logging', description: 'Structured logging', value: 'logging'},
	{label: 'Cache', description: 'In-memory cache', value: 'cache'},
];

describe('MultiOptionList', () => {
	it('renders all options with empty checkboxes', () => {
		const {lastFrame} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Auth');
		expect(frame).toContain('Logging');
		expect(frame).toContain('Cache');
	});

	it('shows description only for focused option', () => {
		const {lastFrame} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Authentication system');
		expect(frame).not.toContain('Structured logging');
	});

	it('toggles selection with space', async () => {
		const {lastFrame, stdin} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);
		stdin.write(' ');
		await delay(50);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('✓');
	});

	it('submits selected values on Enter', async () => {
		const onSubmit = vi.fn();
		const {stdin} = render(
			<MultiOptionList options={options} onSubmit={onSubmit} />,
		);
		stdin.write(' ');
		await delay(50);
		stdin.write('\x1B[B');
		await delay(50);
		stdin.write(' ');
		await delay(50);
		stdin.write('\r');
		expect(onSubmit).toHaveBeenCalledWith(['auth', 'logging']);
	});

	it('submits empty array when nothing selected', () => {
		const onSubmit = vi.fn();
		const {stdin} = render(
			<MultiOptionList options={options} onSubmit={onSubmit} />,
		);
		stdin.write('\r');
		expect(onSubmit).toHaveBeenCalledWith([]);
	});

	it('wraps navigation around options', async () => {
		const {lastFrame, stdin} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);
		stdin.write('\x1B[A');
		await delay(50);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('In-memory cache');
	});

	it('toggles selection when pressing a number key', async () => {
		const {lastFrame, stdin} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);
		stdin.write('1');
		await delay(50);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('✓');
	});

	it('submits number-key-toggled selections on Enter', async () => {
		const onSubmit = vi.fn();
		const {stdin} = render(
			<MultiOptionList options={options} onSubmit={onSubmit} />,
		);
		stdin.write('1');
		await delay(50);
		stdin.write('3');
		await delay(50);
		stdin.write('\r');
		expect(onSubmit).toHaveBeenCalledWith(['auth', 'cache']);
	});

	it('ignores number keys beyond option count', async () => {
		const {lastFrame, stdin} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);
		stdin.write('9');
		await delay(50);
		const frame = lastFrame() ?? '';
		// Should not have any checkmarks
		expect(frame).not.toContain('✓');
	});

	it('renders non-focused options with dim styling', async () => {
		const originalLevel = chalk.level;
		chalk.level = 3;
		try {
			const {lastFrame, stdin} = render(
				<MultiOptionList options={options} onSubmit={vi.fn()} />,
			);
			stdin.write('\x1B[B');
			await delay(50);
			const frame = lastFrame() ?? '';
			// Find lines containing non-focused option labels
			const lines = frame.split('\n');
			const authLine = lines.find(l => l.includes('Auth'));
			expect(authLine).toBeDefined();
			// The non-focused option label line should have dim escape sequence
			expect(authLine).toContain('\u001B[2m');
		} finally {
			chalk.level = originalLevel;
		}
	});
});
