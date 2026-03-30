import {describe, expect, it} from 'vitest';
import {parseSimpleYaml, splitFrontmatter} from './yamlFrontmatter';

describe('parseSimpleYaml', () => {
	it('parses the supported frontmatter scalar and array types', () => {
		expect(
			parseSimpleYaml([
				'name: add-e2e-tests',
				'description: >',
				'  First line',
				'  second line',
				'enabled: true',
				'disabled: false',
				'tools:',
				'  - Read',
				'  - Write',
				'empty:',
			]),
		).toEqual({
			name: 'add-e2e-tests',
			description: 'First line second line',
			enabled: true,
			disabled: false,
			tools: ['Read', 'Write'],
			empty: '',
		});
	});

	it('skips blank lines and ignores malformed entries without a colon', () => {
		expect(
			parseSimpleYaml(['', 'not-a-field', 'name: parser', 'notes: plain text']),
		).toEqual({
			name: 'parser',
			notes: 'plain text',
		});
	});
});

describe('splitFrontmatter', () => {
	it('splits frontmatter from the markdown body and trims outer whitespace', () => {
		expect(
			splitFrontmatter(
				[
					'---',
					'name: sample-skill',
					'description: test parser',
					'---',
					'',
					'# Heading',
					'',
					'Body content',
					'',
				].join('\n'),
				'SKILL.md',
			),
		).toEqual({
			yamlLines: ['name: sample-skill', 'description: test parser'],
			body: '# Heading\n\nBody content',
		});
	});

	it('throws when the opening frontmatter delimiter is missing', () => {
		expect(() => splitFrontmatter('name: value', 'Agent .md')).toThrow(
			'Agent .md must start with --- frontmatter delimiter',
		);
	});

	it('throws when the closing frontmatter delimiter is missing', () => {
		expect(() =>
			splitFrontmatter(['---', 'name: broken'].join('\n'), 'SKILL.md'),
		).toThrow('SKILL.md missing closing --- frontmatter delimiter');
	});
});
