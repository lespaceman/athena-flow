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
		<Box
			flexDirection="row"
			width={innerWidth + 2}
			height={1}
			flexWrap="nowrap"
			overflow="hidden"
			overflowY="hidden"
		>
			<Text wrap="truncate-end">{fr.vertical}</Text>
			<Box
				width={innerWidth}
				height={1}
				flexShrink={0}
				flexDirection="row"
				flexWrap="nowrap"
				overflow="hidden"
				overflowY="hidden"
			>
				{children}
			</Box>
			<Text wrap="truncate-end">{fr.vertical}</Text>
		</Box>
	);
}
