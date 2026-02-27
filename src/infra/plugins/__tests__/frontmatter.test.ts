import {describe, it, expect} from 'vitest';
import {parseFrontmatter} from '../frontmatter';

describe('parseFrontmatter', () => {
	it('parses plain key-value strings', () => {
		const content = [
			'---',
			'name: explore-website',
			'description: Browse a website',
			'---',
			'# Body',
		].join('\n');

		const result = parseFrontmatter(content);

		expect(result.frontmatter.name).toBe('explore-website');
		expect(result.frontmatter.description).toBe('Browse a website');
		expect(result.body).toBe('# Body');
	});

	it('parses folded scalar descriptions', () => {
		const content = [
			'---',
			'name: test-skill',
			'description: >',
			'  This is a long description that',
			'  spans multiple lines.',
			'user-invocable: true',
			'---',
			'Body text',
		].join('\n');

		const result = parseFrontmatter(content);

		expect(result.frontmatter.description).toBe(
			'This is a long description that spans multiple lines.',
		);
		expect(result.frontmatter['user-invocable']).toBe(true);
	});

	it('parses boolean values', () => {
		const content = [
			'---',
			'name: test',
			'description: Test',
			'user-invocable: true',
			'---',
			'',
		].join('\n');

		expect(parseFrontmatter(content).frontmatter['user-invocable']).toBe(true);

		const contentFalse = content.replace('true', 'false');
		expect(parseFrontmatter(contentFalse).frontmatter['user-invocable']).toBe(
			false,
		);
	});

	it('parses string arrays', () => {
		const content = [
			'---',
			'name: test',
			'description: Test',
			'allowed-tools:',
			'  - mcp__server__tool_a',
			'  - mcp__server__tool_b',
			'  - mcp__server__tool_c',
			'---',
			'Body',
		].join('\n');

		const result = parseFrontmatter(content);

		expect(result.frontmatter['allowed-tools']).toEqual([
			'mcp__server__tool_a',
			'mcp__server__tool_b',
			'mcp__server__tool_c',
		]);
	});

	it('parses argument-hint', () => {
		const content = [
			'---',
			'name: explore',
			'description: Explore site',
			'argument-hint: <url> <what to do>',
			'---',
			'',
		].join('\n');

		expect(parseFrontmatter(content).frontmatter['argument-hint']).toBe(
			'<url> <what to do>',
		);
	});

	it('separates body from frontmatter', () => {
		const content = [
			'---',
			'name: test',
			'description: Test',
			'---',
			'',
			'# Title',
			'',
			'Some body content.',
			'More content.',
		].join('\n');

		expect(parseFrontmatter(content).body).toBe(
			'# Title\n\nSome body content.\nMore content.',
		);
	});

	it('throws when file does not start with ---', () => {
		expect(() => parseFrontmatter('name: test\n---\n')).toThrow(
			'must start with ---',
		);
	});

	it('throws when closing --- is missing', () => {
		expect(() => parseFrontmatter('---\nname: test\n')).toThrow(
			'missing closing ---',
		);
	});

	it('throws when name field is missing', () => {
		expect(() => parseFrontmatter('---\ndescription: Test\n---\n')).toThrow(
			'must include a "name"',
		);
	});

	it('throws when description field is missing', () => {
		expect(() => parseFrontmatter('---\nname: test\n---\n')).toThrow(
			'must include a "description"',
		);
	});

	it('handles empty body', () => {
		const content = '---\nname: test\ndescription: Test\n---\n';
		expect(parseFrontmatter(content).body).toBe('');
	});

	it('parses a real-world SKILL.md frontmatter', () => {
		const content = [
			'---',
			'name: explore-website',
			'description: >',
			'  This skill should be used when the user asks to "explore a website",',
			'  "browse a page", "navigate a site".',
			'user-invocable: true',
			'argument-hint: <url> <what to explore or do>',
			'allowed-tools:',
			'  - mcp__agent__navigate',
			'  - mcp__agent__click',
			'---',
			'',
			'# Explore Website',
			'',
			'Use $ARGUMENTS to explore.',
		].join('\n');

		const result = parseFrontmatter(content);

		expect(result.frontmatter.name).toBe('explore-website');
		expect(result.frontmatter.description).toBe(
			'This skill should be used when the user asks to "explore a website", "browse a page", "navigate a site".',
		);
		expect(result.frontmatter['user-invocable']).toBe(true);
		expect(result.frontmatter['argument-hint']).toBe(
			'<url> <what to explore or do>',
		);
		expect(result.frontmatter['allowed-tools']).toEqual([
			'mcp__agent__navigate',
			'mcp__agent__click',
		]);
		expect(result.body).toContain('$ARGUMENTS');
	});
});
