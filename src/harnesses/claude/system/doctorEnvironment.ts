/**
 * Read-only environment survey for `athena doctor --harness=claude`.
 *
 * Inspects the local Claude install: binary, version, auth status, settings
 * scopes (including managed-settings policy keys), and provider env vars.
 * No network calls; all data comes from filesystem stats, settings JSON, and
 * `claude auth status`.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {detectClaudeVersion} from './detectVersion';
import {resolveClaudeBinary} from './resolveBinary';
import {runClaudeAuthStatus} from './verifyHarness';
import {
	PORTABLE_PROVIDER_ENV_VARS,
	resolveClaudeSettingsSurfacePaths,
} from '../auth/settingsSurfaces';
import {
	resolveHookForwarderCommand,
	type HookForwarderResolution,
} from '../hooks/generateHookSettings';

export type SettingsScope = 'managed' | 'user' | 'project' | 'local';

export type SettingsScopeInfo = {
	scope: SettingsScope;
	path: string;
	present: boolean;
	sizeBytes?: number;
	mtime?: string;
	parseError?: string;
	apiKeyHelper?: string;
	managedKeys?: string[];
	forceLoginMethod?: string;
	forceLoginOrgUUID?: string | string[];
	/** Top-level JSON keys present in the file. Surfaces auth-shaped fields
	 * (`env`, `apiKeyHelper`, `awsCredentialExport`, etc.) the user may not
	 * realize they have configured. */
	topLevelKeys?: string[];
	/** Names of env vars defined in the settings `env` block — Claude Code
	 * applies these to every session, so they're a real auth surface. */
	envBlockKeys?: string[];
};

export type AuthSummary = {
	loggedIn: boolean;
	authMethod?: string;
	apiProvider?: string;
	subscriptionType?: string;
	organization?: string;
	email?: string;
	rawMessage: string;
};

export type DoctorEnvironment = {
	platform: NodeJS.Platform;
	cwd: string;
	claudeBinary: string | null;
	claudeVersion: string | null;
	auth: AuthSummary | null;
	settings: SettingsScopeInfo[];
	apiKeyHelperOwner: SettingsScope | null;
	apiKeyHelperCommand: string | null;
	managedPolicyKeys: string[];
	enforcement: {
		forceLoginMethod?: string;
		forceLoginOrgUUID?: string | string[];
	};
	providerEnvVars: string[];
	globalConfigPresent: boolean;
	hookForwarder: HookForwarderResolution;
};

const MANAGED_POLICY_KEYS = [
	'forceLoginMethod',
	'forceLoginOrgUUID',
	'allowManagedHooksOnly',
	'allowManagedMcpServersOnly',
	'allowManagedPermissionRulesOnly',
	'disableAutoMode',
	'disableBypassPermissionsMode',
	'forceRemoteSettingsRefresh',
	'availableModels',
	'model',
	'apiKeyHelper',
	'awsCredentialExport',
] as const;

export type CollectEnvironmentOptions = {
	cwd?: string;
	platform?: NodeJS.Platform;
	homeDir?: string;
	env?: NodeJS.ProcessEnv;
	resolveClaudeBinaryFn?: typeof resolveClaudeBinary;
	detectClaudeVersionFn?: typeof detectClaudeVersion;
	runClaudeAuthStatusFn?: typeof runClaudeAuthStatus;
	resolveHookForwarderCommandFn?: typeof resolveHookForwarderCommand;
	readFileFn?: (filePath: string) => string;
	statFn?: (filePath: string) => fs.Stats;
};

function inspectSettingsFile(
	scope: SettingsScope,
	filePath: string,
	statFn: (filePath: string) => fs.Stats,
	readFileFn: (filePath: string) => string,
): SettingsScopeInfo {
	let stat: fs.Stats;
	try {
		stat = statFn(filePath);
	} catch {
		return {scope, path: filePath, present: false};
	}

	const info: SettingsScopeInfo = {
		scope,
		path: filePath,
		present: true,
		sizeBytes: stat.size,
		mtime: stat.mtime.toISOString(),
	};

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(readFileFn(filePath)) as Record<string, unknown>;
	} catch (error) {
		info.parseError =
			error instanceof Error ? error.message : 'Failed to parse JSON';
		return info;
	}

	info.topLevelKeys = Object.keys(parsed).sort();

	if (typeof parsed['apiKeyHelper'] === 'string') {
		info.apiKeyHelper = parsed['apiKeyHelper'];
	}

	if (parsed['env'] && typeof parsed['env'] === 'object') {
		info.envBlockKeys = Object.keys(parsed['env'] as object).sort();
	}

	if (typeof parsed['forceLoginMethod'] === 'string') {
		info.forceLoginMethod = parsed['forceLoginMethod'];
	}
	const org = parsed['forceLoginOrgUUID'];
	if (typeof org === 'string' || Array.isArray(org)) {
		info.forceLoginOrgUUID = org as string | string[];
	}

	if (scope === 'managed') {
		const found: string[] = [];
		for (const key of MANAGED_POLICY_KEYS) {
			if (Object.prototype.hasOwnProperty.call(parsed, key)) {
				found.push(key);
			}
		}
		info.managedKeys = found;
	}

	return info;
}

function readEnforcement(scopes: SettingsScopeInfo[]): {
	forceLoginMethod?: string;
	forceLoginOrgUUID?: string | string[];
} {
	const out: {
		forceLoginMethod?: string;
		forceLoginOrgUUID?: string | string[];
	} = {};
	for (const scope of scopes) {
		if (scope.forceLoginMethod && !out.forceLoginMethod) {
			out.forceLoginMethod = scope.forceLoginMethod;
		}
		if (scope.forceLoginOrgUUID && !out.forceLoginOrgUUID) {
			out.forceLoginOrgUUID = scope.forceLoginOrgUUID;
		}
	}
	return out;
}

function tryRichAuth(claudeBinary: string): AuthSummary | null {
	try {
		const output = execFileSync(claudeBinary, ['auth', 'status'], {
			timeout: 10000,
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
		const parsed = JSON.parse(output) as {
			loggedIn?: boolean;
			authMethod?: string;
			apiProvider?: string;
			subscriptionType?: string;
			organization?: {name?: string; uuid?: string} | string;
			email?: string;
		};
		const orgName =
			typeof parsed.organization === 'string'
				? parsed.organization
				: (parsed.organization?.name ?? parsed.organization?.uuid);
		return {
			loggedIn: Boolean(parsed.loggedIn),
			authMethod: parsed.authMethod,
			apiProvider: parsed.apiProvider,
			subscriptionType: parsed.subscriptionType,
			organization: orgName,
			email: parsed.email,
			rawMessage: output,
		};
	} catch {
		return null;
	}
}

export function collectEnvironment(
	options: CollectEnvironmentOptions = {},
): DoctorEnvironment {
	const platform = options.platform ?? process.platform;
	const env = options.env ?? process.env;
	const homeDir = options.homeDir ?? os.homedir();
	const cwd = options.cwd ?? process.cwd();
	const resolveBinary = options.resolveClaudeBinaryFn ?? resolveClaudeBinary;
	const detectVersion = options.detectClaudeVersionFn ?? detectClaudeVersion;
	const runAuthStatus = options.runClaudeAuthStatusFn ?? runClaudeAuthStatus;
	const resolveForwarder =
		options.resolveHookForwarderCommandFn ?? resolveHookForwarderCommand;
	const statFn = options.statFn ?? ((p: string) => fs.statSync(p));
	const readFileFn =
		options.readFileFn ?? ((p: string) => fs.readFileSync(p, 'utf8'));
	const settingsPaths = resolveClaudeSettingsSurfacePaths(
		homeDir,
		cwd,
		platform,
		env,
	);

	const claudeBinary = resolveBinary();
	const claudeVersion = claudeBinary ? detectVersion() : null;

	let auth: AuthSummary | null = null;
	if (claudeBinary) {
		const rich = tryRichAuth(claudeBinary);
		if (rich) {
			auth = rich;
		} else {
			const fallback = runAuthStatus(claudeBinary);
			auth = {loggedIn: fallback.ok, rawMessage: fallback.message};
		}
	}

	const scopes: SettingsScopeInfo[] = [
		...settingsPaths.managed.map(file =>
			inspectSettingsFile('managed', file, statFn, readFileFn),
		),
		inspectSettingsFile('user', settingsPaths.user, statFn, readFileFn),
		inspectSettingsFile('project', settingsPaths.project, statFn, readFileFn),
		inspectSettingsFile('local', settingsPaths.local, statFn, readFileFn),
	];

	let apiKeyHelperOwner: SettingsScope | null = null;
	let apiKeyHelperCommand: string | null = null;
	for (const scope of scopes) {
		if (scope.apiKeyHelper) {
			apiKeyHelperOwner = scope.scope;
			apiKeyHelperCommand = scope.apiKeyHelper;
			break;
		}
	}

	const managedScope = scopes.find(s => s.scope === 'managed');
	const managedPolicyKeys = managedScope?.managedKeys ?? [];

	const enforcement = readEnforcement(scopes);

	const providerEnvVars = PORTABLE_PROVIDER_ENV_VARS.filter(name => {
		const value = env[name];
		return typeof value === 'string' && value.length > 0;
	});

	let globalConfigPresent = false;
	try {
		statFn(path.join(homeDir, '.claude.json'));
		globalConfigPresent = true;
	} catch {
		globalConfigPresent = false;
	}

	const hookForwarder = resolveForwarder();

	return {
		platform,
		cwd,
		claudeBinary,
		claudeVersion,
		auth,
		settings: scopes,
		apiKeyHelperOwner,
		apiKeyHelperCommand,
		managedPolicyKeys,
		enforcement,
		providerEnvVars,
		globalConfigPresent,
		hookForwarder,
	};
}
