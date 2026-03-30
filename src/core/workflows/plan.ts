import {
	resolveWorkflowCodexPluginRefs,
	resolveWorkflowLocalPlugins,
} from './installer';
import type {
	CodexWorkflowPluginRef,
	ResolvedLocalWorkflowPlugin,
	WorkflowConfig,
} from './types';

export type WorkflowPlan = {
	workflow: WorkflowConfig;
	localPlugins: ResolvedLocalWorkflowPlugin[];
	agentRoots: string[];
	codexPlugins: CodexWorkflowPluginRef[];
	pluginMcpConfig?: string;
};

export function compileWorkflowPlan(input: {
	workflow?: WorkflowConfig;
	localPlugins?: ResolvedLocalWorkflowPlugin[];
	codexPlugins?: CodexWorkflowPluginRef[];
	pluginMcpConfig?: string;
}): WorkflowPlan | undefined {
	if (!input.workflow) {
		return undefined;
	}

	const localPlugins =
		input.localPlugins ??
		resolveWorkflowLocalPlugins(input.workflow).map(plugin => ({
			ref: plugin.ref,
			pluginDir: plugin.pluginDir,
		}));
	const codexPlugins =
		input.codexPlugins ??
		resolveWorkflowCodexPluginRefs(input.workflow).map(plugin => ({
			ref: plugin.ref,
			pluginName: plugin.pluginName,
			marketplacePath: plugin.marketplacePath,
		}));

	return {
		workflow: input.workflow,
		localPlugins: localPlugins.filter(
			(plugin, index, array) =>
				array.findIndex(candidate => candidate.ref === plugin.ref) === index,
		),
		agentRoots: localPlugins
			.map(plugin => `${plugin.pluginDir}/agents`)
			.filter((root, index, array) => array.indexOf(root) === index),
		codexPlugins: codexPlugins.filter(
			(target, index, array) =>
				array.findIndex(candidate => candidate.ref === target.ref) === index,
		),
		pluginMcpConfig: input.pluginMcpConfig,
	};
}
