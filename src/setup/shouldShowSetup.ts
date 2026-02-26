type SetupTriggerInputs = {
	cliInput: string[];
	setupComplete?: boolean;
	globalConfigExists: boolean;
};

/**
 * Setup is shown when explicitly requested (`athena-cli setup`) or when
 * first-run metadata is incomplete.
 */
export function shouldShowSetup({
	cliInput,
	setupComplete,
	globalConfigExists,
}: SetupTriggerInputs): boolean {
	const isSetupCommand = cliInput[0] === 'setup';
	const isFirstRun = !globalConfigExists || setupComplete !== true;
	return isSetupCommand || isFirstRun;
}
