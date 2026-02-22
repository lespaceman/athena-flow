import React, {useState, useCallback, useEffect} from 'react';
import {Box, Text} from 'ink';
import {useSetupState} from './useSetupState.js';
import ThemeStep from './steps/ThemeStep.js';
import HarnessStep from './steps/HarnessStep.js';
import WorkflowStep from './steps/WorkflowStep.js';
import StepStatus from './components/StepStatus.js';
import {writeGlobalConfig} from '../plugins/config.js';

type SetupResult = {
	theme: string;
	harness?: 'claude-code' | 'codex';
	workflow?: string;
};

type Props = {
	onComplete: (result: SetupResult) => void;
};

export default function SetupWizard({onComplete}: Props) {
	const {stepIndex, stepState, isComplete, markSuccess, markError, advance} =
		useSetupState();
	const [result, setResult] = useState<SetupResult>({theme: 'dark'});

	const handleThemeComplete = useCallback(
		(theme: string) => {
			setResult(prev => ({...prev, theme}));
			markSuccess();
		},
		[markSuccess],
	);

	const handleHarnessComplete = useCallback(
		(harness: string) => {
			setResult(prev => ({
				...prev,
				harness: harness as 'claude-code' | 'codex',
			}));
			markSuccess();
		},
		[markSuccess],
	);

	const handleWorkflowComplete = useCallback(
		(workflow: string) => {
			setResult(prev => ({...prev, workflow}));
			markSuccess();
		},
		[markSuccess],
	);

	const handleWorkflowSkip = useCallback(() => {
		markSuccess();
	}, [markSuccess]);

	// Auto-advance on success after short delay
	useEffect(() => {
		if (stepState === 'success' && !isComplete) {
			const timer = setTimeout(() => advance(), 500);
			return () => clearTimeout(timer);
		}
	}, [stepState, advance, isComplete]);

	// Write config and notify parent on completion
	useEffect(() => {
		if (isComplete) {
			writeGlobalConfig({
				setupComplete: true,
				theme: result.theme,
				harness: result.harness,
				workflow: result.workflow,
			});
			onComplete(result);
		}
	}, [isComplete, result, onComplete]);

	const stepLabels = ['Theme', 'Harness', 'Workflow'];

	return (
		<Box flexDirection="column" paddingX={2} paddingY={1}>
			<Text bold>athena-cli Setup</Text>
			<Text dimColor>
				Step {Math.min(stepIndex + 1, 3)} of 3 —{' '}
				{stepLabels[stepIndex] ?? 'Complete'}
			</Text>
			<Box marginTop={1} flexDirection="column">
				{stepIndex === 0 && stepState !== 'success' && (
					<ThemeStep onComplete={handleThemeComplete} />
				)}
				{stepIndex === 0 && stepState === 'success' && (
					<StepStatus status="success" message={`Theme: ${result.theme}`} />
				)}

				{stepIndex === 1 && (
					<HarnessStep
						onComplete={handleHarnessComplete}
						onError={() => markError()}
					/>
				)}

				{stepIndex === 2 && (
					<WorkflowStep
						onComplete={handleWorkflowComplete}
						onError={() => markError()}
						onSkip={handleWorkflowSkip}
					/>
				)}
			</Box>
		</Box>
	);
}
