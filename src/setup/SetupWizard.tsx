import React, {useState, useCallback, useEffect, useRef} from 'react';
import {Box, Text, useInput} from 'ink';
import {useSetupState} from './useSetupState.js';
import ThemeStep from './steps/ThemeStep.js';
import HarnessStep from './steps/HarnessStep.js';
import WorkflowStep from './steps/WorkflowStep.js';
import StepStatus from './components/StepStatus.js';
import {writeGlobalConfig, type AthenaHarness} from '../plugins/config.js';
import {useTheme} from '../theme/index.js';

export type SetupResult = {
	theme: string;
	harness?: AthenaHarness;
	workflow?: string;
};

type Props = {
	onComplete: (result: SetupResult) => void;
	onThemePreview?: (theme: string) => void;
};

const STEP_LABELS = ['Theme', 'Harness', 'Workflow'];
const PROGRESS_BAR_WIDTH = 18;

function progressBar(step: number, total: number): {filled: string; empty: string} {
	const ratio = total === 0 ? 0 : step / total;
	const filledCount = Math.max(
		0,
		Math.min(PROGRESS_BAR_WIDTH, Math.round(ratio * PROGRESS_BAR_WIDTH)),
	);
	return {
		filled: '='.repeat(filledCount),
		empty: '-'.repeat(PROGRESS_BAR_WIDTH - filledCount),
	};
}

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
		retreat,
	} = useSetupState();
	const [result, setResult] = useState<SetupResult>({theme: theme.name});
	const [retryCount, setRetryCount] = useState(0);
	const [writeError, setWriteError] = useState<string | null>(null);
	const [writeRetryCount, setWriteRetryCount] = useState(0);
	const themePreviewRef = useRef(result.theme);
	const completedRef = useRef(false);

	const handleThemeComplete = useCallback(
		(theme: string) => {
			themePreviewRef.current = theme;
			setResult(prev => ({...prev, theme}));
			onThemePreview?.(theme);
			markSuccess();
		},
		[markSuccess, onThemePreview],
	);

	const handleThemePreview = useCallback(
		(nextTheme: string) => {
			themePreviewRef.current = nextTheme;
			onThemePreview?.(nextTheme);
		},
		[onThemePreview],
	);

	const handleHarnessComplete = useCallback(
		(harness: AthenaHarness) => {
			setResult(prev => ({...prev, harness}));
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

	const handleSkipShortcut = useCallback(() => {
		if (stepState !== 'selecting' || isComplete) {
			return;
		}
		if (stepIndex === 0) {
			const selectedTheme = themePreviewRef.current;
			setResult(prev => ({...prev, theme: selectedTheme}));
			onThemePreview?.(selectedTheme);
			markSuccess();
			return;
		}
		if (stepIndex === 1) {
			handleHarnessSkip();
			return;
		}
		if (stepIndex === 2) {
			handleWorkflowSkip();
		}
	}, [
		stepState,
		isComplete,
		stepIndex,
		markSuccess,
		onThemePreview,
		handleHarnessSkip,
		handleWorkflowSkip,
	]);

	useInput((input, key) => {
		const normalizedInput = input.toLowerCase();

		if (isComplete) {
			if (writeError && normalizedInput === 'r') {
				setWriteError(null);
				setWriteRetryCount(prev => prev + 1);
			}
			return;
		}

		if (stepState === 'error' && normalizedInput === 'r') {
			retry();
			setRetryCount(prev => prev + 1);
			return;
		}

		if (key.escape && stepIndex > 0 && stepState !== 'verifying') {
			retreat();
			return;
		}

		if (normalizedInput === 's') {
			handleSkipShortcut();
		}
	});

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

	const totalSteps = STEP_LABELS.length;
	const activeStep = isComplete
		? totalSteps
		: Math.min(stepIndex + 1, totalSteps);
	const bar = progressBar(activeStep, totalSteps);

	return (
		<Box flexDirection="column" paddingX={3} paddingY={1}>
			<Box flexDirection="column">
				<Text bold color={theme.accent}>
					ATHENA SETUP
				</Text>
				<Text color={theme.textMuted}>
					Configure your defaults in under a minute.
				</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text color={theme.textMuted}>
					Step {activeStep} of {totalSteps} -{' '}
					{STEP_LABELS[stepIndex] ?? 'Complete'}
				</Text>
				<Box>
					<Text color={theme.accent}>[{bar.filled}</Text>
					<Text color={theme.textMuted}>{bar.empty}]</Text>
				</Box>
			</Box>

			<Box marginTop={2} flexDirection="column">
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
				{isComplete && !writeError && (
					<StepStatus status="verifying" message="Saving setup..." />
				)}
				{isComplete && writeError && (
					<>
						<StepStatus status="error" message={writeError} />
						<Text color={theme.textMuted}>Press r to retry saving.</Text>
					</>
				)}

				<Box marginTop={2}>
					<Text color={theme.textMuted}>
						Up/Down move  Enter select  Esc back  S skip  R retry
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
