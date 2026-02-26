type ShouldResolveWorkflowInputs = {
	showSetup: boolean;
	workflowName?: string;
};

/**
 * Setup mode should not depend on existing workflow validity.
 */
export function shouldResolveWorkflow({
	showSetup,
	workflowName,
}: ShouldResolveWorkflowInputs): boolean {
	return Boolean(workflowName) && !showSetup;
}

