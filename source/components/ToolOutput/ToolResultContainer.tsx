import React from 'react';
import {Box, Text} from 'ink';

/**
 * Layout constants for the two-column tool result layout.
 *
 *   [LEFT_MARGIN][GUTTER][CONTENT..................][RIGHT_PAD]
 *   2 chars      2 chars  flex                      1 char
 *
 * GUTTER renders ⎿ on the first line. Multi-line continuation
 * is handled by Ink's flexbox — the gutter column stays fixed.
 */
const LEFT_MARGIN = 2;
const GUTTER_WIDTH = 2; // "⎿ " or "│ "
const RIGHT_PAD = 1;
const TOTAL_OVERHEAD = LEFT_MARGIN + GUTTER_WIDTH + RIGHT_PAD;

const GUTTER_CHAR = '\u23bf'; // ⎿

type Props = {
	children: React.ReactNode | ((availableWidth: number) => React.ReactNode);
	dimGutter?: boolean;
	gutterColor?: string;
};

export default function ToolResultContainer({
	children,
	dimGutter = true,
	gutterColor,
}: Props): React.ReactNode {
	if (children == null) return null;

	const terminalWidth = process.stdout.columns || 80;
	const availableWidth = Math.max(terminalWidth - TOTAL_OVERHEAD, 20);

	const content =
		typeof children === 'function' ? children(availableWidth) : children;

	if (content == null) return null;

	return (
		<Box paddingLeft={LEFT_MARGIN}>
			<Box width={GUTTER_WIDTH} flexShrink={0}>
				<Text dimColor={dimGutter} color={gutterColor}>
					{GUTTER_CHAR}{' '}
				</Text>
			</Box>
			<Box flexDirection="column" flexGrow={1} flexShrink={1}>
				{content}
			</Box>
		</Box>
	);
}

export {TOTAL_OVERHEAD, GUTTER_WIDTH, LEFT_MARGIN, RIGHT_PAD};
