import {
	registerPlugins,
	readConfig,
	readGlobalConfig,
	type AthenaConfig,
} from '../../infra/plugins/index';
import {shouldResolveWorkflow} from '../../setup/shouldResolveWorkflow';
import type {IsolationConfig, IsolationPreset} from '../../harnesses/claude/config/isolation';
import {readClaudeSettingsModel} from '../../harnesses/claude/config/readSettingsModel';
import {installWorkflowPlugins, resolveWorkflow} from '../../core/workflows/index';
import type {WorkflowConfig} from '../../core/workflows/types';

export type RuntimeBootstrapInput = {
	projectDir: string;
	showSetup: boolean;
	workflowFlag?: string;
	pluginFlags?: string[];
	isolationPreset: IsolationPreset;
	verbose?: boolean;
	globalConfig?: AthenaConfig;
	projectConfig?: AthenaConfig;
};

export type RuntimeBootstrapOutput = {
	globalConfig: AthenaConfig;
	projectConfig: AthenaConfig;
	isolationConfig: IsolationConfig;
	pluginMcpConfig?: string;
	workflowRef?: string;
	workflow?: WorkflowConfig;
	modelName: string | null;
	warnings: string[];
};

function mergePluginDirs({
	workflowPluginDirs,
	globalPlugins,
	projectPlugins,
	pluginFlags,
}: {
	workflowPluginDirs: string[];
	globalPlugins: string[];
	projectPlugins: string[];
	pluginFlags: string[];
}): string[] {
	return [
		...new Set([
			...workflowPluginDirs,
			...globalPlugins,
			...projectPlugins,
			...pluginFlags,
		]),
	];
}

export function bootstrapRuntimeConfig({
	projectDir,
	showSetup,
	workflowFlag,
	pluginFlags = [],
	isolationPreset: initialIsolationPreset,
	verbose = false,
	globalConfig: providedGlobalConfig,
	projectConfig: providedProjectConfig,
}: RuntimeBootstrapInput): RuntimeBootstrapOutput {
	const globalConfig = providedGlobalConfig ?? readGlobalConfig();
	const projectConfig = providedProjectConfig ?? readConfig(projectDir);
	const warnings: string[] = [];
	const workflowName =
		workflowFlag ?? projectConfig.workflow ?? globalConfig.workflow;

	let workflowPluginDirs: string[] = [];
	let resolvedWorkflow: WorkflowConfig | undefined;

	const workflowToResolve = shouldResolveWorkflow({showSetup, workflowName})
		? workflowName
		: undefined;

	if (workflowToResolve) {
		resolvedWorkflow = resolveWorkflow(workflowToResolve);
		workflowPluginDirs = installWorkflowPlugins(resolvedWorkflow);
	}

	const pluginDirs = mergePluginDirs({
		workflowPluginDirs,
		globalPlugins: globalConfig.plugins,
		projectPlugins: projectConfig.plugins,
		pluginFlags,
	});
	const pluginResult =
		pluginDirs.length > 0
			? registerPlugins(pluginDirs)
			: {mcpConfig: undefined, workflows: [] as WorkflowConfig[]};
	const pluginMcpConfig = pluginResult.mcpConfig;
	const workflows = pluginResult.workflows;

	let activeWorkflow: WorkflowConfig | undefined = resolvedWorkflow;
	if (!activeWorkflow && workflows.length === 1) {
		activeWorkflow = workflows[0];
	} else if (!activeWorkflow && workflows.length > 1) {
		warnings.push(
			`Multiple workflows found: ${workflows.map(w => w.name).join(', ')}. Use --workflow=<name> to select one.`,
		);
	}

	const additionalDirectories = [
		...globalConfig.additionalDirectories,
		...projectConfig.additionalDirectories,
	];

	const configModel =
		projectConfig.model || globalConfig.model || activeWorkflow?.model;

	let isolationPreset = initialIsolationPreset;
	if (activeWorkflow?.isolation) {
		const presetOrder = ['strict', 'minimal', 'permissive'];
		const workflowIdx = presetOrder.indexOf(activeWorkflow.isolation);
		const userIdx = presetOrder.indexOf(isolationPreset);
		if (workflowIdx > userIdx) {
			warnings.push(
				`Workflow '${activeWorkflow.name}' requires '${activeWorkflow.isolation}' isolation (upgrading from '${isolationPreset}')`,
			);
			isolationPreset = activeWorkflow.isolation as IsolationPreset;
		}
	}

	const isolationConfig: IsolationConfig = {
		preset: isolationPreset,
		additionalDirectories,
		pluginDirs: pluginDirs.length > 0 ? pluginDirs : undefined,
		debug: verbose,
		model: configModel,
	};

	const modelName =
		isolationConfig.model ||
		process.env['ANTHROPIC_MODEL'] ||
		readClaudeSettingsModel(projectDir) ||
		null;

	return {
		globalConfig,
		projectConfig,
		isolationConfig,
		pluginMcpConfig,
		workflowRef: workflowFlag ?? activeWorkflow?.name,
		workflow: activeWorkflow,
		modelName,
		warnings,
	};
}
