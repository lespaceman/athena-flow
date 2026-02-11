import React from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../theme/index.js';

type Props = {
	text: string;
	isStreaming: boolean;
};

export default function StreamingResponse({text, isStreaming}: Props) {
	const theme = useTheme();
	if (!text) {
		return null;
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold color={theme.accent}>
				{isStreaming ? '◐ Streaming' : '● Response'}
			</Text>
			<Text wrap="wrap" color={theme.text}>
				{text}
			</Text>
		</Box>
	);
}
