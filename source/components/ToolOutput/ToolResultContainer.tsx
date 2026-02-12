import React from 'react';
import {Box, Text} from 'ink';

// Layout: [LEFT_MARGIN 3][GUTTER 2 ("⎿ ")][CONTENT...][RIGHT_PAD 1]
const LEFT_MARGIN = 3;
const GUTTER_WIDTH = 2;
const RIGHT_PAD = 1;
const TOTAL_OVERHEAD = LEFT_MARGIN + GUTTER_WIDTH + RIGHT_PAD;

type Props = {
	children: React.ReactNode | ((availableWidth: number) => React.ReactNode);
	dimGutter?: boolean;
	gutterColor?: string;
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
					{'\u23bf'}{' '}
				</Text>
			</Box>
			<Box flexDirection="column" width={availableWidth}>
				{content}
			</Box>
		</Box>
	);
}

export {TOTAL_OVERHEAD};
