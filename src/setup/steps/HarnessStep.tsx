import React, {useState, useCallback} from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../components/StepSelector.js';
import StepStatus from '../components/StepStatus.js';
import {detectClaudeVersion} from '../../utils/detectClaudeVersion.js';
import {useTheme} from '../../theme/index.js';

type Props = {
	onComplete: (harness: string) => void;
	onSkip: () => void;
	onError: (message: string) => void;
};

export default function HarnessStep({onComplete, onSkip, onError}: Props) {
	const theme = useTheme();
	const [status, setStatus] = useState<
		'selecting' | 'verifying' | 'success' | 'error'
	>('selecting');
	const [message, setMessage] = useState('');

	const handleSelect = useCallback(
		(value: string) => {
			if (value === 'skip') {
				onSkip();
				return;
			}
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
						'Claude Code not found. Install it, then press r to retry.',
					);
					setStatus('error');
					onError('Claude Code not found');
				}
			}, 0);
		},
		[onComplete, onError, onSkip],
	);

	return (
		<Box flexDirection="column">
			<Text bold color={theme.accent}>
				Select harness
			</Text>
			<Text color={theme.textMuted}>
				Choose Claude Code now, or skip and configure it later.
			</Text>
			{status === 'selecting' && (
				<StepSelector
					options={[
						{label: 'Claude Code', value: 'claude-code'},
						{label: 'Codex (coming soon)', value: 'codex', disabled: true},
						{label: 'Skip for now', value: 'skip'},
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
