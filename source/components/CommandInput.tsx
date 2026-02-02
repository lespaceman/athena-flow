import React, {useState, useMemo, useEffect, useCallback, useRef} from 'react';
import {Box, Text, useInput} from 'ink';
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
	const [selectedIndex, setSelectedIndex] = useState(0);
	// Bump completionKey to remount TextInput with a new defaultValue after tab completion
	const [completionKey, setCompletionKey] = useState(0);
	const [defaultValue, setDefaultValue] = useState('');

	// Reset all internal state when parent resets the input (after submit)
	useEffect(() => {
		setValue('');
		setDefaultValue('');
		setSelectedIndex(0);
	}, [inputKey]);

	// Determine if we're in command mode (input starts with / and no space yet)
	const isCommandMode = value.startsWith('/') && !value.includes(' ');
	const prefix = isCommandMode ? value.slice(1) : '';

	// Filter commands matching the typed prefix
	const filteredCommands = useMemo(() => {
		if (!isCommandMode) return [];
		if (prefix === '') return registry.getAll();

		return registry
			.getAll()
			.filter(cmd => {
				const names = [cmd.name, ...(cmd.aliases ?? [])];
				return names.some(n => n.startsWith(prefix));
			})
			.slice(0, MAX_SUGGESTIONS);
	}, [isCommandMode, prefix]);

	const showSuggestions = filteredCommands.length > 0;

	// Clamp selectedIndex to valid range synchronously (avoids out-of-bounds between render and effect)
	const safeIndex = showSuggestions
		? Math.min(selectedIndex, filteredCommands.length - 1)
		: 0;

	// Reset selectedIndex when the filtered list changes
	useEffect(() => {
		setSelectedIndex(0);
	}, [filteredCommands.length]);

	// Use refs for values accessed in the useInput handler to keep it stable
	const showSuggestionsRef = useRef(showSuggestions);
	showSuggestionsRef.current = showSuggestions;
	const filteredCommandsRef = useRef(filteredCommands);
	filteredCommandsRef.current = filteredCommands;
	const safeIndexRef = useRef(safeIndex);
	safeIndexRef.current = safeIndex;

	// Tab completion: insert selected command name into input
	const completeSelected = useCallback(() => {
		const cmd = filteredCommandsRef.current[safeIndexRef.current];
		if (!cmd) return;
		const completed = `/${cmd.name} `;
		setDefaultValue(completed);
		setCompletionKey(k => k + 1);
		setValue(completed);
	}, []);

	// Keyboard handler — always active to avoid rawMode toggling issues.
	// Ink's useInput calls setRawMode(false) when isActive flips to false,
	// which disables rawMode globally and breaks TextInput.
	// Instead, guard logic internally.
	const handleKeyInput = useCallback(
		(
			_input: string,
			key: {
				tab: boolean;
				upArrow: boolean;
				downArrow: boolean;
				escape: boolean;
			},
		) => {
			if (!showSuggestionsRef.current) return;

			if (key.tab) {
				completeSelected();
				return;
			}

			if (key.upArrow) {
				setSelectedIndex(i => {
					const len = filteredCommandsRef.current.length;
					return i <= 0 ? len - 1 : i - 1;
				});
				return;
			}

			if (key.downArrow) {
				setSelectedIndex(i => {
					const len = filteredCommandsRef.current.length;
					return i >= len - 1 ? 0 : i + 1;
				});
				return;
			}

			if (key.escape) {
				setDefaultValue('');
				setCompletionKey(k => k + 1);
				setValue('');
			}
		},
		[completeSelected],
	);

	useInput(handleKeyInput);

	// Wrap onSubmit to clear state before parent processes
	const handleSubmit = useCallback(
		(val: string) => {
			setDefaultValue('');
			setValue('');
			setSelectedIndex(0);
			onSubmit(val);
		},
		[onSubmit],
	);

	return (
		<Box flexDirection="column">
			{showSuggestions && (
				<CommandSuggestions
					commands={filteredCommands}
					selectedIndex={safeIndex}
				/>
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
					key={`${inputKey}-${completionKey}`}
					defaultValue={defaultValue}
					onChange={setValue}
					onSubmit={handleSubmit}
					placeholder="Type a message or /command..."
				/>
			</Box>
		</Box>
	);
}
