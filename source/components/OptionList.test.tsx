import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import OptionList from './OptionList.js';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const options = [
	{
		label: 'Concise & minimal',
		description: 'Short names, fewer comments',
		value: 'concise',
	},
	{
		label: 'Verbose & explicit',
		description: 'Long names, many comments',
		value: 'verbose',
	},
	{
		label: 'Balanced & pragmatic',
		description: 'Middle ground approach',
		value: 'balanced',
	},
];

describe('OptionList', () => {
	it('renders all option labels', () => {
		const {lastFrame} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Concise & minimal');
		expect(frame).toContain('Verbose & explicit');
		expect(frame).toContain('Balanced & pragmatic');
	});

	it('shows description only for the focused option', () => {
		const {lastFrame} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Short names, fewer comments');
		expect(frame).not.toContain('Long names, many comments');
		expect(frame).not.toContain('Middle ground approach');
	});

	it('renders a focus indicator on the active option', () => {
		const {lastFrame} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('\u203a');
	});

	it('moves focus down on arrow key', async () => {
		const {lastFrame, stdin} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);
		stdin.write('\x1B[B');
		await delay(50);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Long names, many comments');
		expect(frame).not.toContain('Short names, fewer comments');
	});

	it('moves focus up on arrow key', async () => {
		const {lastFrame, stdin} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);
		stdin.write('\x1B[B');
		await delay(50);
		stdin.write('\x1B[A');
		await delay(50);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Short names, fewer comments');
	});

	it('wraps around when navigating past the last option', async () => {
		const {lastFrame, stdin} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);
		stdin.write('\x1B[B');
		await delay(50);
		stdin.write('\x1B[B');
		await delay(50);
		stdin.write('\x1B[B');
		await delay(50);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Short names, fewer comments');
	});

	it('calls onSelect with value on Enter', () => {
		const onSelect = vi.fn();
		const {stdin} = render(
			<OptionList options={options} onSelect={onSelect} />,
		);
		stdin.write('\r');
		expect(onSelect).toHaveBeenCalledWith('concise');
	});

	it('calls onSelect with correct value after navigating', async () => {
		const onSelect = vi.fn();
		const {stdin} = render(
			<OptionList options={options} onSelect={onSelect} />,
		);
		stdin.write('\x1B[B');
		await delay(50);
		stdin.write('\r');
		expect(onSelect).toHaveBeenCalledWith('verbose');
	});

	it('renders option without description when description is empty', () => {
		const opts = [
			{label: 'Option A', description: '', value: 'a'},
			{label: 'Option B', description: 'Has a description', value: 'b'},
		];
		const {lastFrame} = render(
			<OptionList options={opts} onSelect={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Option A');
		expect(frame).toContain('Option B');
	});
});
