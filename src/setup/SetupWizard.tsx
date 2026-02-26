import React, {useState, useCallback, useEffect, useRef} from 'react';
import {Box, Text, useInput} from 'ink';
import {useSetupState} from './useSetupState.js';
import ThemeStep from './steps/ThemeStep.js';
import HarnessStep from './steps/HarnessStep.js';
import WorkflowStep from './steps/WorkflowStep.js';
import StepStatus from './components/StepStatus.js';
import {writeGlobalConfig} from '../plugins/config.js';
import {useTheme} from '../theme/index.js';

export type SetupResult = {
	theme: string;
	harness?: 'claude-code' | 'codex';
	workflow?: string;
};

type Props = {
	onComplete: (result: SetupResult) => void;
	onThemePreview?: (theme: string) => void;
};

export default function SetupWizard({onComplete, onThemePreview}: Props) {
	const theme = useTheme();
	const {
		stepIndex,
		stepState,
		isComplete,
		markSuccess,
		markError,
		retry,
		advance,
	} = useSetupState();
	const [result, setResult] = useState<SetupResult>({theme: theme.name});
	const [retryCount, setRetryCount] = useState(0);
	const [writeError, setWriteError] = useState<string | null>(null);
	const [writeRetryCount, setWriteRetryCount] = useState(0);
	const completedRef = useRef(false);

	useInput(input => {
		if (stepState === 'error' && input === 'r') {
			retry();
			setRetryCount(prev => prev + 1);
		}
		if (isComplete && writeError && input === 'r') {
			setWriteError(null);
			setWriteRetryCount(prev => prev + 1);
		}
	});

	const handleThemeComplete = useCallback(
		(theme: string) => {
			setResult(prev => ({...prev, theme}));
			onThemePreview?.(theme);
			markSuccess();
		},
		[markSuccess, onThemePreview],
	);

	const handleThemePreview = useCallback(
		(nextTheme: string) => {
			onThemePreview?.(nextTheme);
		},
		[onThemePreview],
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

	const handleHarnessSkip = useCallback(() => {
		setResult(prev => ({...prev, harness: undefined}));
		markSuccess();
	}, [markSuccess]);

	const handleWorkflowComplete = useCallback(
		(workflow: string) => {
			setResult(prev => ({...prev, workflow}));
			markSuccess();
		},
		[markSuccess],
	);

	const handleWorkflowSkip = useCallback(() => {
		setResult(prev => ({...prev, workflow: undefined}));
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
		if (isComplete && !completedRef.current) {
			try {
				completedRef.current = true;
				writeGlobalConfig({
					setupComplete: true,
					theme: result.theme,
					harness: result.harness,
					workflow: result.workflow,
				});
				onComplete(result);
			} catch (error) {
				completedRef.current = false;
				setWriteError(
					`Failed to write setup config: ${(error as Error).message}`,
				);
			}
		}
	}, [isComplete, result, onComplete, writeRetryCount]);

	const stepLabels = ['Theme', 'Harness', 'Workflow'];

	return (
		<Box flexDirection="column" paddingX={2} paddingY={1}>
			<Text bold color={theme.accent}>
				ATHENA SETUP
			</Text>
			<Text color={theme.textMuted}>
				Configure your defaults in under a minute.
			</Text>
			<Text color={theme.textMuted}>
				Step {Math.min(stepIndex + 1, 3)} of 3 —{' '}
				{stepLabels[stepIndex] ?? 'Complete'}
			</Text>
			<Text color={theme.textMuted}>
				{`[1] Theme  [2] Harness  [3] Workflow`}
			</Text>

			<Box marginTop={1} flexDirection="column">
				{stepIndex === 0 && stepState !== 'success' && !isComplete && (
					<ThemeStep
						onComplete={handleThemeComplete}
						onPreview={handleThemePreview}
					/>
				)}
				{stepIndex === 0 && stepState === 'success' && (
					<StepStatus status="success" message={`Theme: ${result.theme}`} />
				)}

				{stepIndex === 1 && !isComplete && (
					<HarnessStep
						key={retryCount}
						onComplete={handleHarnessComplete}
						onSkip={handleHarnessSkip}
						onError={() => markError()}
					/>
				)}

				{stepIndex === 2 && !isComplete && (
					<WorkflowStep
						key={retryCount}
						onComplete={handleWorkflowComplete}
						onError={() => markError()}
						onSkip={handleWorkflowSkip}
					/>
				)}

				{stepState === 'error' && (
					<Text color={theme.textMuted}>Press r to retry this step.</Text>
				)}
				{stepState === 'selecting' && !isComplete && (
					<Text color={theme.textMuted}>Use arrow keys and Enter.</Text>
				)}

				{isComplete && !writeError && (
					<StepStatus status="verifying" message="Saving setup..." />
				)}
				{isComplete && writeError && (
					<>
						<StepStatus status="error" message={writeError} />
						<Text color={theme.textMuted}>Press r to retry saving.</Text>
					</>
				)}
			</Box>
		</Box>
	);
}
