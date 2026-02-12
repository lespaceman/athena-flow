import React from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../../theme/index.js';

type Props = {
	oldText: string;
	newText: string;
};

export default function DiffBlock({oldText, newText}: Props): React.ReactNode {
	const theme = useTheme();

	if (!oldText && !newText) return null;

	const oldLines = oldText.split('\n');
	const newLines = newText.split('\n');

	return (
		<Box flexDirection="column">
			{oldLines.map((line, i) => (
				<Text key={`old-${i}`} color={theme.status.error}>
					{'- '}
					{line}
				</Text>
			))}
			{newLines.map((line, i) => (
				<Text key={`new-${i}`} color={theme.status.success}>
					{'+ '}
					{line}
				</Text>
			))}
		</Box>
	);
}
