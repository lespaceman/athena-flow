import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import QuestionKeybindingBar from './QuestionKeybindingBar.js';

describe('QuestionKeybindingBar', () => {
	it('renders navigation and action hints for single-select', () => {
		const {lastFrame} = render(
			<QuestionKeybindingBar multiSelect={false} optionCount={4} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Navigate');
		expect(frame).toContain('Select');
		expect(frame).toContain('Skip');
	});

	it('renders toggle hint for multi-select', () => {
		const {lastFrame} = render(
			<QuestionKeybindingBar multiSelect={true} optionCount={3} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Toggle');
		expect(frame).toContain('Submit');
		expect(frame).toContain('Skip');
	});

	it('renders number key hint with option count', () => {
		const {lastFrame} = render(
			<QuestionKeybindingBar multiSelect={false} optionCount={4} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('1-4');
		expect(frame).toContain('Jump');
	});

	it('does not render number key hint when optionCount is 0', () => {
		const {lastFrame} = render(
			<QuestionKeybindingBar multiSelect={false} optionCount={0} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('Jump');
	});
});
