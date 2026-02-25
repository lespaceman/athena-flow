import React from 'react';
import {Box, Text} from 'ink';
import chalk from 'chalk';
import {fit} from '../utils/format.js';
import {type Theme} from '../theme/types.js';
import {type FeedColumnWidths} from './FeedRow.js';

type Props = {
	cols: FeedColumnWidths;
	theme: Theme;
};

export function FeedHeader({cols, theme}: Props) {
	const style = (s: string) => chalk.bold.hex(theme.textMuted)(s);
	return (
		<>
			<Box width={1} flexShrink={0}>
				<Text> </Text>
			</Box>
			<Box width={5} flexShrink={0}>
				<Text>{style(fit('TIME', 5))}</Text>
			</Box>
			<Box width={2} flexShrink={0} />
			<Box width={12} flexShrink={0}>
				<Text>{style(fit('EVENT', 12))}</Text>
			</Box>
			<Box width={2} flexShrink={0} />
			<Box width={10} flexShrink={0}>
				<Text>{style(fit('ACTOR', 10))}</Text>
			</Box>
			<Box width={2} flexShrink={0} />
			<Box width={cols.toolW} flexShrink={0}>
				<Text>{style(fit('TOOL', cols.toolW))}</Text>
			</Box>
			<Box width={2} flexShrink={0} />
			<Box flexGrow={1} flexShrink={0}>
				<Text>{style(fit('DETAILS', cols.detailsW))}</Text>
			</Box>
			<Box width={2} flexShrink={0}>
				<Text>{'  '}</Text>
			</Box>
		</>
	);
}
