import os from 'node:os';
import {
	lookupCredential,
	type LookupCredentialOptions,
} from '../system/doctorProbes';
import {
	resolvePortableAuthSettings,
	type PortableAuthSettings,
	type ResolvePortableAuthSettingsOptions,
} from './portableAuth';

export type ResolveRuntimeAuthOptions = ResolvePortableAuthSettingsOptions &
	LookupCredentialOptions;

function shellQuoteSingle(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildInlineApiKeyHelperCommand(value: string): string {
	return `printf %s ${shellQuoteSingle(value)}`;
}

export function resolveRuntimeAuthOverlay(
	options: ResolveRuntimeAuthOptions = {},
): PortableAuthSettings | null {
	const portable = resolvePortableAuthSettings(options);
	if (portable?.apiKeyHelper) {
		return portable;
	}
	if (portable?.env && Object.keys(portable.env).length > 0) {
		return portable;
	}

	const credential = lookupCredential({
		...options,
		cwd: options.cwd ?? process.cwd(),
		homeDir: options.homeDir ?? os.homedir(),
		platform: options.platform ?? process.platform,
		env: options.env ?? process.env,
	});
	if (!credential) {
		return null;
	}

	// Route each credential kind through the channel Claude Code expects:
	//   • apiKey     → apiKeyHelper (output sent as x-api-key)
	//   • authToken  → ANTHROPIC_AUTH_TOKEN env (sent as Authorization: Bearer)
	//   • oauthToken → CLAUDE_CODE_OAUTH_TOKEN env (sent as Authorization: Bearer)
	//
	// Wrapping a non-apiKey credential as apiKeyHelper causes Anthropic to
	// reject the request with "Invalid API key", since OAuth/auth tokens are
	// Bearer credentials, not x-api-key values.
	if (credential.kind === 'apiKey') {
		return {apiKeyHelper: buildInlineApiKeyHelperCommand(credential.value)};
	}
	if (credential.kind === 'authToken') {
		return {env: {ANTHROPIC_AUTH_TOKEN: credential.value}};
	}
	return {env: {CLAUDE_CODE_OAUTH_TOKEN: credential.value}};
}
