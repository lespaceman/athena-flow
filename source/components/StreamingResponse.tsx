import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	text: string;
	isStreaming: boolean;
};

export default function StreamingResponse({text, isStreaming}: Props) {
	if (!text) {
		return null;
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold color="cyan">
				{isStreaming ? '◐ Streaming' : '● Response'}
			</Text>
			<Text wrap="wrap" color="white">
				{text}
			</Text>
		</Box>
	);
}
