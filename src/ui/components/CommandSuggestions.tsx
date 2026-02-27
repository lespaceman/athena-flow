import process from 'node:process';
import {Box, Text} from 'ink';
import {type Command} from '../../app/commands/types';
import {useTheme} from '../theme/index';

type Props = {
	commands: Command[];
	selectedIndex: number;
};

function truncate(text: string, maxLen: number): string {
	if (maxLen <= 0) return '';
	if (text.length <= maxLen) return text;
	return text.slice(0, maxLen - 1) + '\u2026';
}

export default function CommandSuggestions({commands, selectedIndex}: Props) {
	const theme = useTheme();
	if (commands.length === 0) return null;

	// Column widths for alignment across all rows
	const PADDING = 4; // paddingX={2} on each side
	const INDICATOR = 2; // "> " or "  "
	const GAP = 2; // padEnd adds 2 extra chars after name
	const nameColWidth = Math.max(...commands.map(cmd => cmd.name.length + 1));
	const termWidth = process.stdout.columns || 80;
	const maxDescLen = Math.max(
		20,
		termWidth - nameColWidth - PADDING - INDICATOR - GAP,
	);

	return (
		<Box flexDirection="column" paddingX={2}>
			{commands.map((cmd, i) => {
				const isSelected = i === selectedIndex;
				const name = `/${cmd.name}`.padEnd(nameColWidth + 2);
				const desc = truncate(cmd.description, maxDescLen);

				return (
					<Box key={cmd.name}>
						<Text color={theme.accent}>{isSelected ? '> ' : '  '}</Text>
						<Text
							color={isSelected ? theme.accent : theme.text}
							bold={isSelected}
						>
							{name}
						</Text>
						<Text dimColor>{desc}</Text>
					</Box>
				);
			})}
		</Box>
	);
}
