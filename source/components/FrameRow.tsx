import React from 'react';
import {Box, Text} from 'ink';
import {frameGlyphs} from '../glyphs/index.js';

type Props = {
	children: React.ReactNode;
	innerWidth: number;
	ascii: boolean;
};

export function FrameRow({children, innerWidth, ascii}: Props) {
	const fr = frameGlyphs(ascii);
	return (
		<Box flexDirection="row" width={innerWidth + 2}>
			<Text>{fr.vertical}</Text>
			<Box width={innerWidth} flexShrink={0} flexDirection="row">
				{children}
			</Box>
			<Text>{fr.vertical}</Text>
		</Box>
	);
}
