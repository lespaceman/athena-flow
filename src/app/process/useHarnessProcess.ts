import type {AthenaHarness} from '../../infra/plugins/config';
import type {WorkflowConfig} from '../../core/workflows/types';
import type {
	HarnessProcess,
	HarnessProcessConfig,
	HarnessProcessOptions,
	HarnessProcessOverride,
	HarnessProcessPreset,
} from '../../core/runtime/process';
import type {TokenUsage} from '../../shared/types/headerMetrics';
import {resolveHarnessProcessProfile} from '../../harnesses/processProfiles';

export type HarnessProcessResult = HarnessProcess<HarnessProcessOverride> & {
	tokenUsage: TokenUsage;
};

export type UseHarnessProcessInput = {
	harness: AthenaHarness;
	projectDir: string;
	instanceId: number;
	isolation?: HarnessProcessConfig | HarnessProcessPreset;
	pluginMcpConfig?: string;
	verbose?: boolean;
	workflow?: WorkflowConfig;
	options?: HarnessProcessOptions;
};

export function useHarnessProcess(
	input: UseHarnessProcessInput,
): HarnessProcessResult {
	const processProfile = resolveHarnessProcessProfile(input.harness);
	const process = processProfile.useProcess(
		input.projectDir,
		input.instanceId,
		input.isolation,
		input.pluginMcpConfig,
		input.verbose,
		input.workflow,
		{
			...input.options,
			tokenParserFactory: processProfile.tokenParserFactory,
		},
	);

	return {
		spawn: process.spawn,
		isRunning: process.isRunning,
		interrupt: process.sendInterrupt,
		kill: process.kill,
		usage: process.tokenUsage,
		tokenUsage: process.tokenUsage,
	};
}
