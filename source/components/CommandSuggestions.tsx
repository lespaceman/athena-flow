import React from 'react';
import {Box, Text} from 'ink';
import {type Command} from '../commands/types.js';

type Props = {
	commands: Command[];
	selectedIndex: number;
};

export default function CommandSuggestions({commands, selectedIndex}: Props) {
	if (commands.length === 0) return null;

	return (
		<Box flexDirection="column" paddingX={2}>
			{commands.map((cmd, i) => (
				<Box key={cmd.name} gap={2}>
					<Text
						color={i === selectedIndex ? 'cyan' : 'gray'}
						bold={i === selectedIndex}
					>
						/{cmd.name}
					</Text>
					<Text color="gray" dimColor>
						{cmd.description}
					</Text>
				</Box>
			))}
		</Box>
	);
}
