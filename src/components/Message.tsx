import React from 'react';
import {Box, Text} from 'ink';
import {type Message as MessageType} from '../types/index.js';
import {useTheme} from '../theme/index.js';
import {MarkdownText} from './ToolOutput/index.js';
import {getGlyphs} from '../glyphs/index.js';

const g = getGlyphs();

type Props = {
	message: MessageType;
};

export default function Message({message}: Props): React.ReactNode {
	const theme = useTheme();
	const isUser = message.role === 'user';

	if (isUser) {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<Text
					wrap="wrap"
					color={theme.userMessage.text}
					backgroundColor={theme.userMessage.background}
				>
					{`${g['message.user']} `}
					{message.content}
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={theme.accent}>{`${g['tool.bullet']} `}</Text>
				<MarkdownText content={message.content.trimStart()} />
			</Box>
		</Box>
	);
}
