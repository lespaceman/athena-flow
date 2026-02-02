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
			{commands.map((cmd, i) => {
				const isSelected = i === selectedIndex;
				return (
					<Box key={cmd.name} gap={1}>
						<Text color="cyan">{isSelected ? '>' : ' '}</Text>
						<Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
							/{cmd.name}
						</Text>
						<Text dimColor>{cmd.description}</Text>
					</Box>
				);
			})}
		</Box>
	);
}
