import React from 'react';
import {Box, Text} from 'ink';

/**
 * Layout constants for the two-column tool result layout.
 *
 *   [LEFT_MARGIN][GUTTER][GAP][CONTENT...............][RIGHT_PAD]
 *   3 chars      1 char  1    flex                    1 char
 *
 * GUTTER renders ⎿ on the first line. Multi-line continuation
 * is handled by Ink's flexbox — the gutter column stays fixed.
 */
const LEFT_MARGIN = 3;
const GUTTER_WIDTH = 2; // "⎿" + 1 char gap
const RIGHT_PAD = 1;
const TOTAL_OVERHEAD = LEFT_MARGIN + GUTTER_WIDTH + RIGHT_PAD;

const GUTTER_CHAR = '\u23bf'; // ⎿

type Props = {
	children: React.ReactNode | ((availableWidth: number) => React.ReactNode);
	dimGutter?: boolean;
	gutterColor?: string;
	/** Override the base width (e.g. when nested inside a bordered box). */
	parentWidth?: number;
};

export default function ToolResultContainer({
	children,
	dimGutter = true,
	gutterColor,
	parentWidth,
}: Props): React.ReactNode {
	if (children == null) return null;

	const baseWidth = parentWidth ?? process.stdout.columns ?? 80;
	const availableWidth = Math.max(baseWidth - TOTAL_OVERHEAD, 20);

	const content =
		typeof children === 'function' ? children(availableWidth) : children;

	if (content == null) return null;

	return (
		<Box paddingLeft={LEFT_MARGIN} marginTop={1}>
			<Box width={GUTTER_WIDTH} flexShrink={0}>
				<Text dimColor={dimGutter} color={gutterColor}>
					{GUTTER_CHAR}{' '}
				</Text>
			</Box>
			<Box flexDirection="column" width={availableWidth}>
				{content}
			</Box>
		</Box>
	);
}

export {TOTAL_OVERHEAD, GUTTER_WIDTH, LEFT_MARGIN, RIGHT_PAD};
