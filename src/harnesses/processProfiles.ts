import type {AthenaHarness} from '../infra/plugins/config';
import {createTokenAccumulator} from './claude/process/tokenAccumulator';
import {
	useClaudeProcess,
	type UseClaudeProcessOptions,
} from './claude/process/useProcess';
import type {IsolationConfig, IsolationPreset} from './claude/config/isolation';
import type {WorkflowConfig} from '../core/workflows/types';
import type {TokenUsageParserFactory} from '../core/runtime/process';

export type HarnessProcessProfile = {
	useProcess: (
		projectDir: string,
		instanceId: number,
		isolation?: IsolationConfig | IsolationPreset,
		pluginMcpConfig?: string,
		verbose?: boolean,
		workflow?: WorkflowConfig,
		options?: UseClaudeProcessOptions,
	) => ReturnType<typeof useClaudeProcess>;
	tokenParserFactory: TokenUsageParserFactory;
};

const CLAUDE_PROCESS_PROFILE: HarnessProcessProfile = {
	useProcess: useClaudeProcess,
	tokenParserFactory: createTokenAccumulator,
};

export function resolveHarnessProcessProfile(
	harness: AthenaHarness,
): HarnessProcessProfile {
	switch (harness) {
		case 'claude-code':
			return CLAUDE_PROCESS_PROFILE;
		case 'openai-codex':
		case 'opencode':
		default:
			// Backward-compatible fallback until additional harness process
			// adapters land.
			return CLAUDE_PROCESS_PROFILE;
	}
}
