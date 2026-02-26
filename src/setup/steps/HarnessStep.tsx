import React, {useState, useCallback} from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../components/StepSelector.js';
import StepStatus from '../components/StepStatus.js';
import {detectClaudeVersion} from '../../utils/detectClaudeVersion.js';
import {useTheme} from '../../theme/index.js';
import type {AthenaHarness} from '../../plugins/config.js';

type Props = {
	onComplete: (harness: AthenaHarness) => void;
	onError: (message: string) => void;
};

export default function HarnessStep({onComplete, onError}: Props) {
	const theme = useTheme();
	const [status, setStatus] = useState<
		'selecting' | 'verifying' | 'success' | 'error'
	>('selecting');
	const [message, setMessage] = useState('');

	const handleSelect = useCallback(
		(value: AthenaHarness) => {
			if (value !== 'claude-code') {
				const label =
					value === 'openai-codex' ? 'OpenAI Codex' : 'OpenCode';
				setMessage(`${label} selected`);
				setStatus('success');
				onComplete(value);
				return;
			}
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
		[onComplete, onError],
	);

	return (
		<Box flexDirection="column">
			<Text bold color={theme.accent}>
				Select harness
			</Text>
			<Text color={theme.textMuted}>
				Choose your coding harness. You can skip this step with S.
			</Text>
			{status === 'selecting' && (
				<Box marginTop={1}>
					<StepSelector
						options={[
							{label: '1. Claude Code', value: 'claude-code'},
							{label: '2. OpenAI Codex', value: 'openai-codex'},
							{label: '3. OpenCode', value: 'opencode'},
						]}
						onSelect={value => handleSelect(value as AthenaHarness)}
					/>
				</Box>
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
