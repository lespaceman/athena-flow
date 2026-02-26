import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

export type SelectorOption = {
	label: string;
	value: string;
	disabled?: boolean;
};

type Props = {
	options: SelectorOption[];
	onSelect: (value: string) => void;
	isActive?: boolean;
};

export default function StepSelector({
	options,
	onSelect,
	isActive = true,
}: Props) {
	const [cursor, setCursor] = useState(0);

	useInput(
		(_input, key) => {
			if (key.downArrow) {
				setCursor(prev => Math.min(prev + 1, options.length - 1));
			} else if (key.upArrow) {
				setCursor(prev => Math.max(prev - 1, 0));
			} else if (key.return) {
				const opt = options[cursor];
				if (opt && !opt.disabled) {
					onSelect(opt.value);
				}
			}
		},
		{isActive},
	);

	return (
		<Box flexDirection="column">
			{options.map((opt, i) => {
				const isCursor = i === cursor;
				const prefix = isCursor ? '❯' : ' ';
				return (
					<Text
						key={opt.value}
						dimColor={opt.disabled}
						color={isCursor && !opt.disabled ? 'cyan' : undefined}
					>
						{prefix} {opt.label}
					</Text>
				);
			})}
		</Box>
	);
}
