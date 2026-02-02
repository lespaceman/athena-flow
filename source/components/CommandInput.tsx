import React, {useState, useMemo} from 'react';
import {Box, Text} from 'ink';
import {TextInput} from '@inkjs/ui';
import * as registry from '../commands/registry.js';
import CommandSuggestions from './CommandSuggestions.js';

const MAX_SUGGESTIONS = 6;

type Props = {
	inputKey: number;
	onSubmit: (value: string) => void;
};

export default function CommandInput({inputKey, onSubmit}: Props) {
	const [value, setValue] = useState('');

	// Determine if we're in command mode (input starts with /)
	const isCommandMode = value.startsWith('/') && !value.includes(' ');
	const prefix = isCommandMode ? value.slice(1) : '';

	// Filter commands matching the typed prefix
	const filteredCommands = useMemo(() => {
		if (!isCommandMode || prefix === '') {
			return isCommandMode ? registry.getAll().slice(0, MAX_SUGGESTIONS) : [];
		}

		return registry
			.getAll()
			.filter(cmd => {
				const names = [cmd.name, ...(cmd.aliases ?? [])];
				return names.some(n => n.startsWith(prefix));
			})
			.slice(0, MAX_SUGGESTIONS);
	}, [isCommandMode, prefix]);

	// Build suggestion strings for TextInput's built-in tab completion
	const suggestions = useMemo(() => {
		if (!isCommandMode) return undefined;
		return filteredCommands.map(cmd => `/${cmd.name} `);
	}, [isCommandMode, filteredCommands]);

	return (
		<Box flexDirection="column">
			{filteredCommands.length > 0 && (
				<CommandSuggestions commands={filteredCommands} selectedIndex={0} />
			)}
			<Box
				borderStyle="single"
				borderColor="gray"
				borderTop
				borderBottom={false}
				borderLeft={false}
				borderRight={false}
				paddingX={1}
			>
				<Text color="gray">{'>'} </Text>
				<TextInput
					key={inputKey}
					onChange={setValue}
					onSubmit={onSubmit}
					suggestions={suggestions}
					placeholder="Type a message or /command..."
				/>
			</Box>
		</Box>
	);
}
