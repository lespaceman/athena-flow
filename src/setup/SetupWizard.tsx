import {useState, useCallback, useEffect, useRef} from 'react';
import {Box, Text, useInput} from 'ink';
import {useSetupState} from './useSetupState';
import ThemeStep from './steps/ThemeStep';
import HarnessStep from './steps/HarnessStep';
import WorkflowStep from './steps/WorkflowStep';
import McpOptionsStep from './steps/McpOptionsStep';
import StepStatus from './components/StepStatus';
import WizardFrame from './components/WizardFrame';
import WizardHints from './components/WizardHints';
import {getGlyphs} from '../ui/glyphs/index';
import {
	writeGlobalConfig,
	type AthenaHarness,
	type McpServerChoices,
} from '../infra/plugins/config';
import {
	collectMcpServersWithOptions,
	type McpServerWithOptions,
} from '../infra/plugins/mcpOptions';
import {useTheme} from '../ui/theme/index';

export type SetupResult = {
	theme: string;
	harness?: AthenaHarness;
	workflow?: string;
	mcpServerOptions?: McpServerChoices;
};

type Props = {
	onComplete: (result: SetupResult) => void;
	onThemePreview?: (theme: string) => void;
};

const STEP_SUMMARIES = [
	{label: 'Theme', summarize: (r: SetupResult) => r.theme},
	{label: 'Harness', summarize: (r: SetupResult) => r.harness ?? 'skipped'},
	{label: 'Workflow', summarize: (r: SetupResult) => r.workflow ?? 'skipped'},
	{
		label: 'MCP Options',
		summarize: (r: SetupResult) => {
			const n = Object.keys(r.mcpServerOptions ?? {}).length;
			return n > 0 ? `${n} server(s)` : 'auto';
		},
	},
];

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
	const [mcpServersWithOptions, setMcpServersWithOptions] = useState<
		McpServerWithOptions[]
	>([]);

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
		(workflow: string, pluginDirs: string[]) => {
			setResult(prev => ({...prev, workflow}));
			setMcpServersWithOptions(collectMcpServersWithOptions(pluginDirs));
			markSuccess();
		},
		[markSuccess],
	);

	const handleMcpOptionsComplete = useCallback(
		(choices: McpServerChoices) => {
			setResult(prev => ({...prev, mcpServerOptions: choices}));
			markSuccess();
		},
		[markSuccess],
	);

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
		if (stepIndex === 3) {
			handleMcpOptionsComplete({});
		}
	}, [
		stepState,
		isComplete,
		stepIndex,
		markSuccess,
		onThemePreview,
		handleHarnessSkip,
		handleMcpOptionsComplete,
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
		return undefined;
	}, [stepState, advance, isComplete]);

	// Write config and notify parent on completion
	useEffect(() => {
		if (isComplete && !completedRef.current) {
			try {
				completedRef.current = true;
				const workflowSelections = result.workflow
					? {
							[result.workflow]: {
								mcpServerOptions: result.mcpServerOptions,
							},
						}
					: undefined;
				writeGlobalConfig({
					setupComplete: true,
					theme: result.theme,
					harness: result.harness,
					activeWorkflow: result.workflow,
					workflowSelections,
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

	return (
		<WizardFrame
			title="ATHENA SETUP"
			header={
				<Text color={theme.textMuted}>
					Configure your defaults in under a minute.
				</Text>
			}
			footer={
				<WizardHints
					stepState={
						isComplete ? (writeError ? 'error' : 'verifying') : stepState
					}
					stepIndex={stepIndex}
				/>
			}
		>
			{STEP_SUMMARIES.slice(
				0,
				isComplete ? STEP_SUMMARIES.length : stepIndex,
			).map((step, i) => (
				<Text key={i} color={theme.status.success}>
					{getGlyphs()['todo.done']} {step.label} · {step.summarize(result)}
				</Text>
			))}

			{stepIndex === 0 && !isComplete && (
				<ThemeStep
					onComplete={handleThemeComplete}
					onPreview={handleThemePreview}
				/>
			)}
			{stepIndex === 1 && !isComplete && (
				<Box marginTop={1}>
					<HarnessStep
						key={retryCount}
						onComplete={handleHarnessComplete}
						onError={() => markError()}
					/>
				</Box>
			)}
			{stepIndex === 2 && !isComplete && (
				<Box marginTop={1}>
					<WorkflowStep
						key={retryCount}
						onComplete={handleWorkflowComplete}
						onError={() => markError()}
					/>
				</Box>
			)}
			{stepIndex === 3 && !isComplete && (
				<Box marginTop={1}>
					<McpOptionsStep
						servers={mcpServersWithOptions}
						onComplete={handleMcpOptionsComplete}
					/>
				</Box>
			)}
			{stepState === 'error' && !isComplete && (
				<Text color={theme.status.error}>Press r to retry this step.</Text>
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
		</WizardFrame>
	);
}
