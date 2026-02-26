import React, {useState, useCallback} from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../components/StepSelector.js';
import StepStatus from '../components/StepStatus.js';
import {detectClaudeVersion} from '../../utils/detectClaudeVersion.js';

type Props = {
	onComplete: (harness: string) => void;
	onError: (message: string) => void;
};

export default function HarnessStep({onComplete, onError}: Props) {
	const [status, setStatus] = useState<
		'selecting' | 'verifying' | 'success' | 'error'
	>('selecting');
	const [message, setMessage] = useState('');

	const handleSelect = useCallback(
		(value: string) => {
			if (value !== 'claude-code') return;
			setStatus('verifying');
			// Run detection asynchronously to not block render
			setTimeout(() => {
				const version = detectClaudeVersion();
				if (version) {
					setMessage(`Claude Code v${version} detected`);
					setStatus('success');
					onComplete('claude-code');
				} else {
					setMessage(
						'Claude Code not found. Install from https://docs.anthropic.com/en/docs/claude-code',
					);
					setStatus('error');
					onError('Claude Code not found');
				}
			}, 0);
		},
		[onComplete, onError],
	);

	return (
		<Box flexDirection="column">
			<Text bold>Select harness:</Text>
			{status === 'selecting' && (
				<StepSelector
					options={[
						{label: 'Claude Code', value: 'claude-code'},
						{label: 'Codex (coming soon)', value: 'codex', disabled: true},
					]}
					onSelect={handleSelect}
				/>
			)}
			{(status === 'verifying' ||
				status === 'success' ||
				status === 'error') && (
				<StepStatus
					status={status}
					message={message || 'Verifying Claude Code...'}
				/>
			)}
		</Box>
	);
}
