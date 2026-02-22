import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import ThemeStep from '../ThemeStep.js';

describe('ThemeStep', () => {
	it('renders Dark and Light options', () => {
		const {lastFrame} = render(<ThemeStep onComplete={() => {}} />);
		const frame = lastFrame()!;
		expect(frame).toContain('Dark');
		expect(frame).toContain('Light');
	});

	it('calls onComplete with selected theme on Enter', () => {
		let result = '';
		const {stdin} = render(
			<ThemeStep
				onComplete={v => {
					result = v;
				}}
			/>,
		);
		stdin.write('\r');
		expect(result).toBe('dark');
	});
});
