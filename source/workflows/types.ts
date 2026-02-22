/**
 * Workflow configuration — loaded from workflow.json.
 *
 * Workflows live in ~/.config/athena/workflows/{name}/workflow.json
 * and orchestrate multiple plugins via marketplace refs.
 */

export type LoopConfig = {
	enabled: boolean;
	completionPromise: string;
	maxIterations: number;
};

export type WorkflowConfig = {
	name: string;
	description?: string;
	version?: string;
	plugins: string[];
	promptTemplate: string;
	loop?: LoopConfig;
	isolation?: string;
	model?: string;
	env?: Record<string, string>;
};
