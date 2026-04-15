import {describe, expect, it} from 'vitest';
import {renderMarkdown} from '../../shared/markdown/renderMarkdown';

describe('renderMarkdown', () => {
	it('renders bold text with ANSI formatting', () => {
		const lines = renderMarkdown({
			content: 'Hello **world**',
			width: 40,
			mode: 'inline-feed',
		}).lines;
		const joined = lines.join('\n');
		// Should not contain raw ** markers
		expect(joined).not.toContain('**');
		// Should contain the word "world"
		expect(joined).toContain('world');
	});

	it('renders inline code without raw backticks', () => {
		const lines = renderMarkdown({
			content: 'Use `npm install`',
			width: 40,
			mode: 'inline-feed',
		}).lines;
		const joined = lines.join('\n');
		expect(joined).not.toContain('`');
		expect(joined).toContain('npm install');
	});

	it('renders headers without # prefix', () => {
		const lines = renderMarkdown({
			content: '# Title\nBody text',
			width: 40,
			mode: 'inline-feed',
		}).lines;
		const joined = lines.join('\n');
		expect(joined).not.toMatch(/^#/m);
		expect(joined).toContain('Title');
		expect(joined).toContain('Body text');
	});

	it('renders tables without raw pipe characters as delimiters', () => {
		const md = '| Name | Value |\n|------|-------|\n| foo  | bar   |';
		const lines = renderMarkdown({
			content: md,
			width: 60,
			mode: 'inline-feed',
		}).lines;
		const joined = lines.join('\n');
		expect(joined).toContain('foo');
		expect(joined).toContain('bar');
	});

	it('returns single empty-string line for empty input', () => {
		expect(
			renderMarkdown({content: '', width: 40, mode: 'inline-feed'}).lines,
		).toEqual(['']);
	});

	it('handles plain text without markdown gracefully', () => {
		const lines = renderMarkdown({
			content: 'Just plain text',
			width: 40,
			mode: 'inline-feed',
		}).lines;
		expect(lines.join('\n')).toContain('Just plain text');
	});
});
