import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
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
});
