import React from 'react';
import {Box, Text} from 'ink';
import {type Message as MessageType} from '../types/index.js';

type Props = {
	message: MessageType;
};

export default function Message({message}: Props) {
	const isUser = message.role === 'user';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text color={isUser ? 'blue' : 'green'}>
				{isUser ? '> You' : '< Assistant'}
			</Text>
			<Box paddingLeft={2}>
				<Text wrap="wrap">{message.content}</Text>
			</Box>
		</Box>
	);
}
