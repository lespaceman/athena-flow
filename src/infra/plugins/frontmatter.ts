/**
 * YAML frontmatter parser for SKILL.md files.
 *
 * Handles the subset of YAML used in skill frontmatter:
 * - Plain `key: value` strings
 * - Folded scalars (`key: >` with indented continuation lines)
 * - Booleans (`true` / `false`)
 * - String arrays (lines starting with `  - `)
 */

import {type SkillFrontmatter, type ParsedSkill} from './types';

/**
 * Parse a SKILL.md file into frontmatter + body.
 * Throws if the file does not start with a `---` frontmatter block.
 */
export function parseFrontmatter(content: string): ParsedSkill {
	const lines = content.split('\n');

	if (lines[0]?.trim() !== '---') {
		throw new Error('SKILL.md must start with --- frontmatter delimiter');
	}

	const closingIndex = lines.indexOf('---', 1);
	if (closingIndex === -1) {
		throw new Error('SKILL.md missing closing --- frontmatter delimiter');
	}

	const yamlLines = lines.slice(1, closingIndex);
	const body = lines
		.slice(closingIndex + 1)
		.join('\n')
		.trim();
	const frontmatter = parseYaml(yamlLines);

	if (!frontmatter['name'] || typeof frontmatter['name'] !== 'string') {
		throw new Error('SKILL.md frontmatter must include a "name" field');
	}

	if (
		!frontmatter['description'] ||
		typeof frontmatter['description'] !== 'string'
	) {
		throw new Error('SKILL.md frontmatter must include a "description" field');
	}

	return {frontmatter: frontmatter as SkillFrontmatter, body};
}

type YamlValue = string | boolean | string[];

/**
 * Parse the simple YAML subset used in skill frontmatter.
 */
function parseYaml(lines: string[]): Record<string, YamlValue> {
	const result: Record<string, YamlValue> = {};
	let i = 0;

	while (i < lines.length) {
		const line = lines[i]!;

		// Skip blank lines
		if (line.trim() === '') {
			i++;
			continue;
		}

		const colonIdx = line.indexOf(':');
		if (colonIdx === -1) {
			i++;
			continue;
		}

		const key = line.slice(0, colonIdx).trim();
		const rawValue = line.slice(colonIdx + 1).trim();

		if (rawValue === '>') {
			// Folded scalar: collect indented continuation lines
			const parts: string[] = [];
			i++;
			while (i < lines.length && lines[i]!.startsWith('  ')) {
				parts.push(lines[i]!.trim());
				i++;
			}
			result[key] = parts.join(' ');
			continue;
		}

		if (rawValue === '') {
			// Could be a string array — check if next lines are `  - item`
			const items: string[] = [];
			i++;
			while (i < lines.length && lines[i]!.match(/^\s+-\s/)) {
				items.push(lines[i]!.replace(/^\s+-\s/, '').trim());
				i++;
			}
			if (items.length > 0) {
				result[key] = items;
			} else {
				result[key] = '';
			}
			continue;
		}

		// Boolean
		if (rawValue === 'true') {
			result[key] = true;
			i++;
			continue;
		}
		if (rawValue === 'false') {
			result[key] = false;
			i++;
			continue;
		}

		// Plain string value
		result[key] = rawValue;
		i++;
	}

	return result;
}
