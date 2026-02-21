/**
 * Workflow configuration — loaded from workflow.json in plugin directories.
 */

export type LoopConfig = {
	enabled: boolean;
	completionPromise: string;
	maxIterations: number;
};

export type WorkflowConfig = {
	name: string;
	description?: string;
	promptTemplate: string;
	loop: LoopConfig;
	isolation?: string;
	requiredPlugins?: string[];
};
