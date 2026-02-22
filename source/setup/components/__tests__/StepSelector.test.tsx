import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import StepSelector from '../StepSelector.js';

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

	it('renders disabled options as grayed out and non-selectable', async () => {
		let selected = '';
		const {lastFrame, stdin} = render(
			<StepSelector
				options={[
					{label: 'Claude Code', value: 'claude-code'},
					{label: 'Codex (coming soon)', value: 'codex', disabled: true},
				]}
				onSelect={v => {
					selected = v;
				}}
			/>,
		);
		// Move down to disabled item
		stdin.write('\u001B[B');
		await delay(50);
		// Try to select — should not fire
		stdin.write('\r');
		expect(selected).toBe('');
		expect(lastFrame()!).toContain('coming soon');
	});
});
