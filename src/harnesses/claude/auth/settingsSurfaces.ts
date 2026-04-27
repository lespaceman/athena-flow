import fs from 'node:fs';
import path from 'node:path';

export const PORTABLE_PROVIDER_ENV_VARS = [
	'ANTHROPIC_API_KEY',
	'ANTHROPIC_AUTH_TOKEN',
	'CLAUDE_CODE_OAUTH_TOKEN',
	'ANTHROPIC_BASE_URL',
	'ANTHROPIC_BEDROCK_BASE_URL',
	'CLAUDE_CODE_USE_BEDROCK',
	'CLAUDE_CODE_USE_VERTEX',
	'CLAUDE_CODE_USE_FOUNDRY',
	'AWS_PROFILE',
	'AWS_REGION',
	'GOOGLE_APPLICATION_CREDENTIALS',
	'ANTHROPIC_FOUNDRY_API_KEY',
	'ANTHROPIC_FOUNDRY_BASE_URL',
	'ANTHROPIC_FOUNDRY_RESOURCE',
	'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
] as const;

export function resolveClaudeSettingsDir(
	homeDir: string,
	env: NodeJS.ProcessEnv,
): string {
	return env['CLAUDE_CONFIG_DIR'] ?? path.join(homeDir, '.claude');
}

export function managedSettingsDir(
	platform: NodeJS.Platform,
	env: NodeJS.ProcessEnv,
): string {
	if (platform === 'darwin') {
		return '/Library/Application Support/ClaudeCode';
	}
	if (platform === 'win32') {
		const programFiles = env['PROGRAMFILES'] ?? 'C:\\Program Files';
		return path.join(programFiles, 'ClaudeCode');
	}
	return '/etc/claude-code';
}

export function listManagedSettingsPaths(
	platform: NodeJS.Platform,
	env: NodeJS.ProcessEnv,
	readdirSync: typeof fs.readdirSync = fs.readdirSync,
): string[] {
	const baseDir = managedSettingsDir(platform, env);
	const paths = [path.join(baseDir, 'managed-settings.json')];
	const dropInDir = path.join(baseDir, 'managed-settings.d');

	try {
		const dropIns = readdirSync(dropInDir)
			.filter(name => name.endsWith('.json'))
			.sort()
			.map(name => path.join(dropInDir, name));
		paths.push(...dropIns);
	} catch {
		// Drop-in directory is optional.
	}

	return paths;
}

export type ClaudeSettingsSurfacePaths = {
	managed: string[];
	user: string;
	project: string;
	local: string;
};

export function resolveClaudeSettingsSurfacePaths(
	homeDir: string,
	cwd: string,
	platform: NodeJS.Platform,
	env: NodeJS.ProcessEnv,
	readdirSync: typeof fs.readdirSync = fs.readdirSync,
): ClaudeSettingsSurfacePaths {
	return {
		managed: listManagedSettingsPaths(platform, env, readdirSync),
		user: path.join(resolveClaudeSettingsDir(homeDir, env), 'settings.json'),
		project: path.join(cwd, '.claude', 'settings.json'),
		local: path.join(cwd, '.claude', 'settings.local.json'),
	};
}
