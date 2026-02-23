import React from 'react';
import {Box, Text} from 'ink';
import {highlight} from 'cli-highlight';
import {supportsHyperlinks, hyperlink} from '../../utils/hyperlink.js';

type Props = {
	content: string;
	language?: string;
	maxLines?: number;
};

const MAX_HIGHLIGHT_SIZE = 50_000;

/** Match absolute file paths with optional :line:col suffix */
const FILE_PATH_RE = /(\/[\w./-]+(?::\d+(?::\d+)?))/g;

function linkifyFilePaths(text: string): string {
	if (!supportsHyperlinks()) return text;
	return text.replace(FILE_PATH_RE, match => {
		const uri = `file://${match}`;
		return hyperlink(match, uri);
	});
}

export default function CodeBlock({
	content,
	language,
	maxLines,
}: Props): React.ReactNode {
	if (!content) return null;

	const lines = content.split('\n');
	const truncated = maxLines != null && lines.length > maxLines;
	const displayLines = truncated ? lines.slice(0, maxLines) : lines;
	const omitted = truncated ? lines.length - maxLines! : 0;
	const displayText = displayLines.join('\n');

	let highlighted: string;
	try {
		highlighted =
			language && displayText.length <= MAX_HIGHLIGHT_SIZE
				? highlight(displayText, {language})
				: displayText;
	} catch {
		highlighted = displayText;
	}

	highlighted = linkifyFilePaths(highlighted);

	return (
		<Box flexDirection="column">
			<Text dimColor>{highlighted}</Text>
			{truncated && <Text dimColor>({omitted} more lines)</Text>}
		</Box>
	);
}
