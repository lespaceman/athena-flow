import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import QuestionKeybindingBar from './QuestionKeybindingBar.js';

describe('QuestionKeybindingBar', () => {
	it('renders navigation and action hints for single-select', () => {
		const {lastFrame} = render(<QuestionKeybindingBar multiSelect={false} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Navigate');
		expect(frame).toContain('Select');
		expect(frame).toContain('Skip');
	});

	it('renders toggle hint for multi-select', () => {
		const {lastFrame} = render(<QuestionKeybindingBar multiSelect={true} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Toggle');
		expect(frame).toContain('Submit');
		expect(frame).toContain('Skip');
	});
});
