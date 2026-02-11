import React from 'react';
import {Box, Text} from 'ink';
import {type Message as MessageType} from '../types/index.js';
import {useTheme} from '../theme/index.js';

type Props = {
	message: MessageType;
};

export default function Message({message}: Props) {
	const theme = useTheme();
	const isUser = message.role === 'user';

	if (isUser) {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<Text wrap="wrap" color={theme.userMessage.text} backgroundColor={theme.userMessage.background}>
					{'❯ '}
					{message.content}
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text wrap="wrap" color={theme.text}>
				{`● ${message.content.trimStart()}`}
			</Text>
		</Box>
	);
}
