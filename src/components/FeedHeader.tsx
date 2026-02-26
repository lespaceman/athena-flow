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

function FeedHeaderImpl({cols, theme}: Props) {
	const style = (s: string) => chalk.bold.hex(theme.textMuted)(s);
	return (
		<>
			<Box width={1} flexShrink={0}>
				<Text> </Text>
			</Box>
			<Box width={5} flexShrink={0}>
				<Text wrap="truncate-end">{style(fit('TIME', 5))}</Text>
			</Box>
			<Box width={cols.timeEventGapW} flexShrink={0} />
			<Box width={12} flexShrink={0}>
				<Text wrap="truncate-end">{style(fit('EVENT', 12))}</Text>
			</Box>
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={10} flexShrink={0}>
				<Text wrap="truncate-end">{style(fit('ACTOR', 10))}</Text>
			</Box>
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={cols.toolW} flexShrink={0}>
				<Text wrap="truncate-end">{style(fit('TOOL', cols.toolW))}</Text>
			</Box>
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={cols.detailsW} flexShrink={0}>
				<Text wrap="truncate-end">{style(fit('DETAILS', cols.detailsW))}</Text>
			</Box>
			{cols.resultW > 0 && (
				<>
					<Box width={cols.detailsResultGapW} flexShrink={0} />
					<Box width={cols.resultW} flexShrink={0}>
						<Text wrap="truncate-end">
							{style(fit('RESULT', cols.resultW))}
						</Text>
					</Box>
				</>
			)}
			<Box flexGrow={1} flexShrink={1} />
			<Box width={cols.gapW} flexShrink={0} />
			<Box width={3} flexShrink={0}>
				<Text wrap="truncate-end">{'   '}</Text>
			</Box>
		</>
	);
}

export const FeedHeader = React.memo(FeedHeaderImpl);
