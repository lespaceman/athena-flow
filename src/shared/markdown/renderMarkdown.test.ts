import {describe, expect, it} from 'vitest';
import stripAnsi from 'strip-ansi';
import {renderMarkdown} from './renderMarkdown';

describe('renderMarkdown', () => {
	it('renders nested list items instead of flattening them', () => {
		const rendered = renderMarkdown({
			content: '- parent\n  - child',
			width: 60,
			mode: 'tool-output',
		});
		const output = stripAnsi(rendered.text);

		expect(output).toContain('parent');
		expect(output).toContain('child');
		expect(output).toMatch(/parent[\s\S]*\n\s*• child/);
	});

	it('renders task list checkbox state', () => {
		const rendered = renderMarkdown({
			content: '- [x] done\n- [ ] pending',
			width: 60,
			mode: 'tool-output',
		});
		const output = stripAnsi(rendered.text);

		expect(output).toContain('[x] done');
		expect(output).toContain('[ ] pending');
		expect(output).toMatch(/\[x\] done[\s\S]*\n\s*• \[ \] pending/);
	});

	it('preserves loose list paragraph spacing', () => {
		const rendered = renderMarkdown({
			content: '- first paragraph\n\n  second paragraph',
			width: 60,
			mode: 'detail-view',
		});
		const output = stripAnsi(rendered.text);

		expect(output).toContain('first paragraph\n');
		expect(output).toMatch(/\n\s*\n {4}second paragraph/);
	});

	it('normalizes repeated blank lines to a single blank line', () => {
		const rendered = renderMarkdown({
			content: '# Heading\n\n\nBody',
			width: 60,
			mode: 'inline-feed',
		});
		const output = stripAnsi(rendered.text);

		expect(output).toContain('Heading\n\nBody');
		expect(output).not.toContain('Heading\n\n\nBody');
	});

	it('does not leak colon placeholders in list items with code spans', () => {
		const rendered = renderMarkdown({
			content:
				'- Read `playwright.config.ts` to learn `baseURL: "https://myapp.com"`, `testDir: "../../utils/tests"`',
			width: 120,
			mode: 'tool-output',
		});
		const output = stripAnsi(rendered.text);

		expect(output).not.toContain('*#COLON|*');
		expect(output).toContain('baseURL:');
		expect(output).toContain('testDir:');
	});

	it('keeps hanging indent for wrapped ordered list items', () => {
		const rendered = renderMarkdown({
			content:
				'1. Verify before you spec. Every assertion mechanism should be confirmed in the browser during exploration, not assumed later.',
			width: 52,
			mode: 'inline-feed',
		});
		const output = stripAnsi(rendered.text);

		expect(output).toMatch(
			/1\. Verify before you spec\.[\s\S]*\n\s+mechanism should be confirmed in the browser/,
		);
		expect(output).not.toMatch(/explor\s*\nation/);
	});

	it('keeps narrow tables and wraps cell content', () => {
		const rendered = renderMarkdown({
			content: [
				'| TC-ID | Description | Priority |',
				'| --- | --- | --- |',
				'| TC-MAP-001 | Camera markers visible on map after page load | Critical |',
			].join('\n'),
			width: 36,
			mode: 'tool-output',
		});
		const output = stripAnsi(rendered.text);

		expect(output).toContain('┌');
		expect(output).toContain('│');
		expect(output).toContain('Description');
		expect(output).toContain('Camera markers v');
		expect(output).toContain('isible on map af');
		expect(output).toContain('ter page load');
		expect(output).not.toContain('…');
	});

	it('renders narrow inline-feed tables as stacked records', () => {
		const rendered = renderMarkdown({
			content: [
				'## Skills used and why',
				'',
				'| Skill | Used? | Why / Why not |',
				'| --- | --- | --- |',
				'| generate-test-cases | No | I wrote specs directly instead of loading this skill |',
				'',
				'After table paragraph.',
			].join('\n'),
			width: 37,
			mode: 'inline-feed',
		});
		const output = stripAnsi(rendered.text);

		expect(output).toContain('• Skill: generate-test-cases');
		expect(output).toContain('Used?: No');
		expect(output).toContain('Why / Why not:');
		expect(output).toMatch(
			/Skills used and why\n\s*\n\s*• Skill: generate-test-cases/,
		);
		expect(output).toMatch(/I wrote specs\s+directly instead/);
		expect(output).toMatch(/of loading this\s+skill/);
		expect(output).toMatch(
			/Why \/ Why not: I wrote specs\s*\n\s+directly instead\s*\n\s+of loading this\s*\n\s+skill/,
		);
		expect(output).toMatch(/skill\s*\n\s*\nAfter table paragraph\./);
		expect(output).toContain('After table paragraph.');
		expect(output).not.toContain('┌');
		expect(output).not.toContain('│');
	});

	it('adds a blank line after list blocks before following content', () => {
		const rendered = renderMarkdown({
			content: [
				'- first item',
				'- second item',
				'',
				'After list paragraph.',
			].join('\n'),
			width: 60,
			mode: 'inline-feed',
		});
		const output = stripAnsi(rendered.text);

		expect(output).toMatch(/second item\n\s*\nAfter list paragraph\./);
	});
});
