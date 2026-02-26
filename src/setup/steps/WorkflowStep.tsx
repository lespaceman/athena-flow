import React, {useState, useCallback} from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../components/StepSelector.js';
import StepStatus from '../components/StepStatus.js';
import {installWorkflow, resolveWorkflow} from '../../workflows/index.js';

// Marketplace ref for the e2e-test-builder workflow
const E2E_WORKFLOW_REF =
	'e2e-test-builder@lespaceman/athena-workflow-marketplace';

type Props = {
	onComplete: (workflowName: string) => void;
	onError: (message: string) => void;
	onSkip: () => void;
};

export default function WorkflowStep({onComplete, onError, onSkip}: Props) {
	const [status, setStatus] = useState<
		'selecting' | 'verifying' | 'success' | 'error'
	>('selecting');
	const [message, setMessage] = useState('');

	const handleSelect = useCallback(
		(value: string) => {
			if (value === 'none') {
				onSkip();
				return;
			}
			setStatus('verifying');
			setTimeout(() => {
				try {
					const name = installWorkflow(E2E_WORKFLOW_REF);
					// Verify it resolves
					resolveWorkflow(name);
					setMessage(`Workflow "${name}" installed`);
					setStatus('success');
					onComplete(name);
				} catch (err) {
					const msg = (err as Error).message;
					setMessage(`Installation failed: ${msg}`);
					setStatus('error');
					onError(msg);
				}
			}, 0);
		},
		[onComplete, onError, onSkip],
	);

	return (
		<Box flexDirection="column">
			<Text bold>Select workflow to install:</Text>
			{status === 'selecting' && (
				<StepSelector
					options={[
						{label: 'e2e-test-builder', value: 'e2e-test-builder'},
						{
							label: 'bug-triage (coming soon)',
							value: 'bug-triage',
							disabled: true,
						},
						{label: 'None — configure later', value: 'none'},
					]}
					onSelect={handleSelect}
				/>
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
