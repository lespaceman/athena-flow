import {readClaudeSettingsModel} from './readSettingsModel';

export type ResolveClaudeModelInput = {
	projectDir: string;
	configuredModel?: string;
	envModel?: string;
	readSettingsModel?: (projectDir: string) => string | null;
};

/**
 * Resolve Claude model using the same precedence used by bootstrap:
 * explicit config -> ANTHROPIC_MODEL -> Claude settings files.
 */
export function resolveClaudeModel({
	projectDir,
	configuredModel,
	envModel = process.env['ANTHROPIC_MODEL'],
	readSettingsModel = readClaudeSettingsModel,
}: ResolveClaudeModelInput): string | null {
	if (configuredModel) return configuredModel;
	if (envModel) return envModel;
	return readSettingsModel(projectDir);
}
