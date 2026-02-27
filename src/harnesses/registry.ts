import type {AthenaHarness} from '../infra/plugins/config';
import {detectClaudeVersion} from './claude/system/detectVersion';

export type HarnessCapability = {
	id: AthenaHarness;
	label: string;
	enabled: boolean;
	verify?: () => {ok: boolean; message: string};
};

const HARNESS_CAPABILITIES: HarnessCapability[] = [
	{
		id: 'claude-code',
		label: 'Claude Code',
		enabled: true,
		verify: () => {
			const version = detectClaudeVersion();
			return version
				? {ok: true, message: `Claude Code v${version} detected`}
				: {
						ok: false,
						message:
							'Claude Code not found. Install it, then press r to retry.',
					};
		},
	},
	{
		id: 'openai-codex',
		label: 'OpenAI Codex (coming soon)',
		enabled: false,
	},
	{
		id: 'opencode',
		label: 'OpenCode (coming soon)',
		enabled: false,
	},
];

export function listHarnessCapabilities(): HarnessCapability[] {
	return HARNESS_CAPABILITIES;
}
