import {useState, useCallback, useEffect} from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../components/StepSelector';
import StepStatus from '../components/StepStatus';
import {
	installWorkflowFromSource,
	resolveWorkflow,
	installWorkflowPlugins,
} from '../../core/workflows/index';
import {resolveWorkflowInstall} from '../../infra/plugins/marketplace';
import {
	loadWorkflowOptions,
	type WorkflowOption,
} from '../../core/workflows/workflowOptions';
import {useTheme} from '../../ui/theme/index';

type Props = {
	onComplete: (workflowName: string, pluginDirs: string[]) => void;
	onError: (message: string) => void;
};

export default function WorkflowStep({onComplete, onError}: Props) {
	const theme = useTheme();
	const [status, setStatus] = useState<
		'loading' | 'selecting' | 'verifying' | 'success' | 'error'
	>('loading');
	const [message, setMessage] = useState('');
	const [options, setOptions] = useState<WorkflowOption[]>([]);

	useEffect(() => {
		try {
			const nextOptions = loadWorkflowOptions();
			if (nextOptions.length === 0) {
				throw new Error(
					'No workflows are currently published in the Athena marketplace.',
				);
			}
			setOptions(nextOptions);
			setStatus('selecting');
		} catch (err) {
			const msg = (err as Error).message;
			setMessage(`Workflow discovery failed: ${msg}`);
			setStatus('error');
			onError(msg);
		}
	}, [onError]);

	const handleSelect = useCallback(
		(value: string) => {
			setStatus('verifying');
			setTimeout(() => {
				try {
					const name = installWorkflowFromSource(
						resolveWorkflowInstall(value, []),
					);
					// Verify it resolves
					const resolved = resolveWorkflow(name);
					const pluginDirs = installWorkflowPlugins(resolved);
					setMessage(`Workflow "${name}" installed`);
					setStatus('success');
					onComplete(name, pluginDirs);
				} catch (err) {
					const msg = (err as Error).message;
					setMessage(`Installation failed: ${msg}`);
					setStatus('error');
					onError(msg);
				}
			}, 0);
		},
		[onComplete, onError],
	);

	return (
		<Box flexDirection="column">
			<Text bold color={theme.accent}>
				Install a workflow
			</Text>
			<Text color={theme.textMuted}>Select a workflow to continue.</Text>
			<Text color={theme.textMuted}>
				Workflow defaults apply as soon as setup finishes.
			</Text>
			{status === 'loading' && (
				<StepStatus status="verifying" message="Loading workflows..." />
			)}
			{status === 'selecting' && (
				<Box marginTop={1}>
					<StepSelector options={options} onSelect={handleSelect} />
				</Box>
			)}
			{(status === 'verifying' ||
				status === 'success' ||
				status === 'error') && (
				<StepStatus
					status={status}
					message={message || 'Installing workflow...'}
				/>
			)}
		</Box>
	);
}
