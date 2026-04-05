type ShouldResolveWorkflowInputs = {
	showSetup: boolean;
	workflowName?: string;
};

/**
 * Workflows are always resolved through the registry path so they stay synced
 * with their recorded source on every startup.
 */
export function shouldResolveWorkflow({
	workflowName,
}: ShouldResolveWorkflowInputs): boolean {
	return Boolean(workflowName);
}
