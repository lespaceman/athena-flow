import type {AthenaHarness} from '../infra/plugins/config';
import {createTokenAccumulator} from './claude/process/tokenAccumulator';
import {
	useClaudeProcess,
	type UseClaudeProcessResult,
	type UseClaudeProcessOptions,
} from './claude/process/useProcess';
import type {IsolationConfig, IsolationPreset} from './claude/config/isolation';
import type {WorkflowConfig} from '../core/workflows/types';
import type {
	HarnessProcessConfig,
	HarnessProcessOptions,
	HarnessProcessPreset,
	TokenUsageParserFactory,
} from '../core/runtime/process';

type HarnessProcessHook = Pick<
	UseClaudeProcessResult,
	'spawn' | 'isRunning' | 'sendInterrupt' | 'kill' | 'tokenUsage'
>;

export type HarnessProcessProfile = {
	useProcess: (
		projectDir: string,
		instanceId: number,
		processConfig?: HarnessProcessConfig | HarnessProcessPreset,
		pluginMcpConfig?: string,
		verbose?: boolean,
		workflow?: WorkflowConfig,
		options?: HarnessProcessOptions,
	) => HarnessProcessHook;
	tokenParserFactory: TokenUsageParserFactory;
};

const CLAUDE_PROCESS_PROFILE: HarnessProcessProfile = {
	useProcess: (
		projectDir,
		instanceId,
		processConfig,
		pluginMcpConfig,
		verbose,
		workflow,
		options,
	) =>
		useClaudeProcess(
			projectDir,
			instanceId,
			processConfig as IsolationConfig | IsolationPreset | undefined,
			pluginMcpConfig,
			verbose,
			workflow,
			options as UseClaudeProcessOptions | undefined,
		),
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
