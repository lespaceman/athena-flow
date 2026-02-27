import type {AthenaHarness} from '../../infra/plugins/config';
import {
	useClaudeProcess,
	type UseClaudeProcessOptions,
} from '../../harnesses/claude/process/useProcess';
import type {
	IsolationConfig,
	IsolationPreset,
} from '../../harnesses/claude/config/isolation';
import type {WorkflowConfig} from '../../core/workflows/types';
import type {HarnessProcess} from '../../core/runtime/process';
import type {TokenUsage} from '../../shared/types/headerMetrics';

export type HarnessProcessResult = HarnessProcess<Partial<IsolationConfig>> & {
	tokenUsage: TokenUsage;
};

export type UseHarnessProcessInput = {
	harness: AthenaHarness;
	projectDir: string;
	instanceId: number;
	isolation?: IsolationConfig | IsolationPreset;
	pluginMcpConfig?: string;
	verbose?: boolean;
	workflow?: WorkflowConfig;
	options?: UseClaudeProcessOptions;
};

export function useHarnessProcess(
	input: UseHarnessProcessInput,
): HarnessProcessResult {
	// Current implementation only has Claude; the neutral boundary is stable
	// so additional harnesses can plug in without changing AppShell callers.
	const claude = useClaudeProcess(
		input.projectDir,
		input.instanceId,
		input.isolation,
		input.pluginMcpConfig,
		input.verbose,
		input.workflow,
		input.options,
	);

	return {
		spawn: claude.spawn,
		isRunning: claude.isRunning,
		interrupt: claude.sendInterrupt,
		kill: claude.kill,
		usage: claude.tokenUsage,
		tokenUsage: claude.tokenUsage,
	};
}
