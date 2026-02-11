import React, {useState, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
import {useTheme} from '../theme/index.js';

type Props = {
	confirmText: string;
	onConfirm: () => void;
	onCancel: () => void;
};

export default function TypeToConfirm({
	confirmText,
	onConfirm,
	onCancel,
}: Props) {
	const [input, setInput] = useState('');

	// Check if current input matches confirmText (case-insensitive) or "yes"
	const isMatch =
		input.toLowerCase() === confirmText.toLowerCase() ||
		input.toLowerCase() === 'yes';

	const handleInput = useCallback(
		(
			char: string,
			key: {
				escape?: boolean;
				return?: boolean;
				backspace?: boolean;
				delete?: boolean;
			},
		) => {
			// Handle Escape - cancel
			if (key.escape) {
				onCancel();
				return;
			}

			// Handle Enter - confirm if input matches
			if (key.return) {
				if (isMatch) {
					onConfirm();
				}
				return;
			}

			// Handle backspace/delete
			if (key.backspace || key.delete) {
				setInput(prev => prev.slice(0, -1));
				return;
			}

			// Add printable characters
			if (char && char.length === 1 && !key.escape && !key.return) {
				setInput(prev => prev + char);
			}
		},
		[isMatch, onConfirm, onCancel],
	);

	useInput(handleInput);

	const theme = useTheme();

	return (
		<Box flexDirection="column" paddingX={1}>
			{/* Prompt line */}
			<Text bold color={theme.status.error}>
				{'\u26d4'} Type "{confirmText}" or "yes" to allow:
			</Text>

			{/* Input line with cursor */}
			<Box>
				<Text>&gt; </Text>
				<Text color={isMatch ? theme.status.success : undefined}>{input}</Text>
				<Text>{'\u258c'}</Text>
			</Box>

			{/* Hint */}
			<Text dimColor>Press Escape to deny</Text>
		</Box>
	);
}
