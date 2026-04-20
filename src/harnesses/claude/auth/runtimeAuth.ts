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

	return {
		apiKeyHelper: buildInlineApiKeyHelperCommand(credential.value),
	};
}
