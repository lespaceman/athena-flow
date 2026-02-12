import React from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../../theme/index.js';

type Props = {
	oldText: string;
	newText: string;
	maxLines?: number;
	availableWidth?: number;
};

export default function DiffBlock({
	oldText,
	newText,
	maxLines,
}: Props): React.ReactNode {
	const theme = useTheme();

	if (!oldText && !newText) return null;

	const oldLines = oldText.split('\n');
	const newLines = newText.split('\n');
	const allLines = [
		...oldLines.map(line => ({prefix: '- ', line, color: theme.status.error})),
		...newLines.map(line => ({
			prefix: '+ ',
			line,
			color: theme.status.success,
		})),
	];

	const truncated = maxLines != null && allLines.length > maxLines;
	const displayLines = truncated ? allLines.slice(0, maxLines) : allLines;
	const omitted = truncated ? allLines.length - maxLines! : 0;

	return (
		<Box flexDirection="column">
			{displayLines.map((entry, i) => (
				<Text key={i} color={entry.color}>
					{entry.prefix}
					{entry.line}
				</Text>
			))}
			{truncated && <Text dimColor>({omitted} more lines)</Text>}
		</Box>
	);
}
