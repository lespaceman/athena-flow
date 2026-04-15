import React from 'react';
import {Box, Text} from 'ink';
import {renderMarkdown} from '../../../shared/markdown/renderMarkdown';

type Props = {
	content: string;
	maxLines?: number;
	availableWidth: number;
};

export default function MarkdownText({
	content,
	maxLines,
	availableWidth,
}: Props): React.ReactNode {
	if (!content) return null;

	const rendered = renderMarkdown({
		content,
		width: availableWidth,
		mode: 'tool-output',
	});

	if (maxLines != null) {
		const lines = rendered.lines;
		if (lines.length > maxLines) {
			const omitted = lines.length - maxLines;
			const truncated = lines.slice(0, maxLines).join('\n');
			return (
				<Box flexDirection="column">
					<Text>{truncated}</Text>
					<Text dimColor>({omitted} more lines)</Text>
				</Box>
			);
		}
	}

	return <Text>{rendered.text}</Text>;
}
