import fs from 'node:fs';
import os from 'node:os';
import {
	PORTABLE_PROVIDER_ENV_VARS,
	resolveClaudeSettingsSurfacePaths,
} from './settingsSurfaces';

export type PortableAuthSettings = {
	env?: Partial<Record<(typeof PORTABLE_PROVIDER_ENV_VARS)[number], string>>;
	apiKeyHelper?: string;
};

export type ResolvePortableAuthSettingsOptions = {
	cwd?: string;
	homeDir?: string;
	platform?: NodeJS.Platform;
	env?: NodeJS.ProcessEnv;
	readFileFn?: (filePath: string) => string;
};

function readJsonObject(
	filePath: string,
	readFileFn: (filePath: string) => string,
): Record<string, unknown> | null {
	try {
		return JSON.parse(readFileFn(filePath)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function resolvePortableAuthSettings(
	options: ResolvePortableAuthSettingsOptions = {},
): PortableAuthSettings | null {
	const cwd = options.cwd ?? process.cwd();
	const homeDir = options.homeDir ?? os.homedir();
	const platform = options.platform ?? process.platform;
	const env = options.env ?? process.env;
	const readFileFn =
		options.readFileFn ??
		((filePath: string) => fs.readFileSync(filePath, 'utf8'));
	const settingsPaths = resolveClaudeSettingsSurfacePaths(
		homeDir,
		cwd,
		platform,
		env,
	);
	const candidatePaths = [
		...settingsPaths.managed,
		settingsPaths.user,
		settingsPaths.project,
		settingsPaths.local,
	];

	const resolvedEnv: PortableAuthSettings['env'] = {};
	let apiKeyHelper: string | undefined;

	for (const filePath of candidatePaths) {
		const parsed = readJsonObject(filePath, readFileFn);
		if (!parsed) continue;

		const envBlock = parsed['env'];
		if (envBlock && typeof envBlock === 'object') {
			const vars = envBlock as Record<string, unknown>;
			for (const name of PORTABLE_PROVIDER_ENV_VARS) {
				const value = vars[name];
				if (typeof value === 'string' && value.length > 0) {
					resolvedEnv[name] = value;
				}
			}
		}

		if (
			typeof parsed['apiKeyHelper'] === 'string' &&
			parsed['apiKeyHelper'].length > 0
		) {
			apiKeyHelper = parsed['apiKeyHelper'];
		}
	}

	const result: PortableAuthSettings = {};
	if (Object.keys(resolvedEnv).length > 0) {
		result.env = resolvedEnv;
	}
	if (apiKeyHelper) {
		result.apiKeyHelper = apiKeyHelper;
	}

	return Object.keys(result).length > 0 ? result : null;
}
