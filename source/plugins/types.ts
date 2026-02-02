/**
 * Plugin system types.
 */

export type PluginManifest = {
	name: string;
	description: string;
	version: string;
	author?: {name: string};
	repository?: string;
};

/** Frontmatter keys matching the YAML kebab-case convention in SKILL.md files. */
export type SkillFrontmatter = {
	name: string;
	description: string;
	'user-invocable'?: boolean;
	'argument-hint'?: string;
	'allowed-tools'?: string[];
};

export type ParsedSkill = {
	frontmatter: SkillFrontmatter;
	body: string;
};

export type LoadedPlugin = {
	manifest: PluginManifest;
	dir: string;
};
