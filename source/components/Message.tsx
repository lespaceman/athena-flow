import React from 'react';
import {Box, Text} from 'ink';
import {type Message as MessageType} from '../types/index.js';

type Props = {
	message: MessageType;
};

export default function Message({message}: Props) {
	const isUser = message.role === 'user';

	if (isUser) {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<Text wrap="wrap" color="#b0b0b0" backgroundColor="#2d3748">
					{'❯ '}
					{message.content}
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text wrap="wrap" color="white">
				{`● ${message.content.trimStart()}`}
			</Text>
		</Box>
	);
}
