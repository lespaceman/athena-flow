import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import StepSelector from '../StepSelector';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('StepSelector', () => {
	it('renders options with cursor on first item', () => {
		const {lastFrame} = render(
			<StepSelector
				options={[
					{label: 'Dark', value: 'dark'},
					{label: 'Light', value: 'light'},
				]}
				onSelect={() => {}}
			/>,
		);
		const frame = lastFrame()!;
		expect(frame).toContain('Dark');
		expect(frame).toContain('Light');
	});

	it('calls onSelect with value on Enter', () => {
		let selected = '';
		const {stdin} = render(
			<StepSelector
				options={[
					{label: 'Dark', value: 'dark'},
					{label: 'Light', value: 'light'},
				]}
				onSelect={v => {
					selected = v;
				}}
			/>,
		);
		stdin.write('\r');
		expect(selected).toBe('dark');
	});

	it('supports initialValue and emits highlight changes', async () => {
		const highlighted: string[] = [];
		const {stdin} = render(
			<StepSelector
				options={[
					{label: 'Dark', value: 'dark'},
					{label: 'Light', value: 'light'},
				]}
				initialValue="light"
				onHighlight={value => {
					highlighted.push(value);
				}}
				onSelect={() => {}}
			/>,
		);
		await delay(30);
		stdin.write('\u001B[A');
		await delay(30);
		expect(highlighted).toContain('light');
		expect(highlighted).toContain('dark');
	});

	it('skips disabled options while navigating', async () => {
		let selected = '';
		const {lastFrame, stdin} = render(
			<StepSelector
				options={[
					{label: 'Claude Code', value: 'claude-code'},
					{label: 'Codex (coming soon)', value: 'codex', disabled: true},
					{label: 'Skip for now', value: 'skip'},
				]}
				onSelect={v => {
					selected = v;
				}}
			/>,
		);
		stdin.write('\u001B[B');
		await delay(50);
		stdin.write('\r');
		expect(selected).toBe('skip');
		expect(lastFrame()!).toContain('coming soon');
	});
});
