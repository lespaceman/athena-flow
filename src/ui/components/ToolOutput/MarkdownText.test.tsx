import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import MarkdownText from './MarkdownText';

describe('MarkdownText', () => {
	it('returns null for empty content', () => {
		const {lastFrame} = render(<MarkdownText content="" />);
		expect(lastFrame()).toBe('');
	});

	it('renders markdown content', () => {
		const {lastFrame} = render(<MarkdownText content="hello **world**" />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('hello');
		expect(frame).toContain('world');
	});

	it('renders bold inside list items', () => {
		const content = '* **Critical:** leaked data\n* **Warning:** slow query';
		const {lastFrame} = render(<MarkdownText content={content} />);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('**Critical:**');
		expect(frame).toContain('Critical:');
	});

	it('truncates when output exceeds maxLines', () => {
		const content = Array.from({length: 50}, (_, i) => `Line ${i}`).join(
			'\n\n',
		);
		const {lastFrame} = render(<MarkdownText content={content} maxLines={5} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('more lines');
		expect(frame).not.toContain('Line 49');
	});
});
