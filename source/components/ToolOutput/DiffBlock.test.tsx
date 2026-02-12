import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import DiffBlock from './DiffBlock.js';

describe('DiffBlock', () => {
	it('returns null for empty old and new text', () => {
		const {lastFrame} = render(<DiffBlock oldText="" newText="" />);
		expect(lastFrame()).toBe('');
	});

	it('renders old lines with - prefix and new lines with + prefix', () => {
		const {lastFrame} = render(
			<DiffBlock oldText="old line" newText="new line" />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('- old line');
		expect(frame).toContain('+ new line');
	});

	it('truncates when total lines exceed maxLines', () => {
		const oldText = Array.from({length: 30}, (_, i) => `old ${i}`).join('\n');
		const newText = Array.from({length: 30}, (_, i) => `new ${i}`).join('\n');
		const {lastFrame} = render(
			<DiffBlock oldText={oldText} newText={newText} maxLines={10} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('more lines');
		expect(frame).not.toContain('old 29');
	});
});
