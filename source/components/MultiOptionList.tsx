import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {type OptionItem} from './OptionList.js';

type Props = {
	options: OptionItem[];
	onSubmit: (values: string[]) => void;
};

export default function MultiOptionList({options, onSubmit}: Props) {
	const [focusIndex, setFocusIndex] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	useInput((input, key) => {
		if (key.downArrow) {
			setFocusIndex(i => (i + 1) % options.length);
		} else if (key.upArrow) {
			setFocusIndex(i => (i - 1 + options.length) % options.length);
		} else if (input === ' ') {
			const option = options[focusIndex];
			if (option) {
				setSelected(prev => {
					const next = new Set(prev);
					if (next.has(option.value)) {
						next.delete(option.value);
					} else {
						next.add(option.value);
					}
					return next;
				});
			}
		} else if (key.return) {
			onSubmit(options.filter(o => selected.has(o.value)).map(o => o.value));
		}
	});

	return (
		<Box flexDirection="column">
			{options.map((option, index) => {
				const isFocused = index === focusIndex;
				const isSelected = selected.has(option.value);
				const checkbox = isSelected ? '✓' : ' ';
				return (
					<Box key={option.value} flexDirection="column">
						<Box>
							<Text
								color={isFocused ? 'cyan' : undefined}
								bold={isFocused}
								inverse={isFocused}
							>
								{isFocused ? ' › ' : '   '}
								[{checkbox}] {option.label}
								{isFocused ? ' ' : ''}
							</Text>
						</Box>
						{isFocused && option.description ? (
							<Box paddingLeft={3}>
								<Text dimColor>{option.description}</Text>
							</Box>
						) : null}
					</Box>
				);
			})}
		</Box>
	);
}
