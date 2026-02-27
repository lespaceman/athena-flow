import React from 'react';
import {Box, Text} from 'ink';
import chalk from 'chalk';
import {fit, fitAnsi} from '../../shared/utils/format';
import {type Theme} from '../theme/types';
import {type FeedColumnWidths} from './FeedRow';

type Props = {
	cols: FeedColumnWidths;
	theme: Theme;
};

export function formatFeedHeaderLine(
	cols: FeedColumnWidths,
	theme: Theme,
	innerWidth: number,
): string {
	const style = (s: string) => chalk.bold.hex(theme.textMuted)(s);
	let line = ' ';
	line += style(fit('TIME', 5));
	line += ' '.repeat(cols.timeEventGapW);
	line += style(fit('EVENT', 12));
	line += ' '.repeat(cols.gapW);
	line += style(fit('ACTOR', 10));
	line += ' '.repeat(cols.gapW);
	line += style(fit('TOOL', cols.toolW));
	line += ' '.repeat(cols.gapW);
	line += style(fit('DETAILS', cols.detailsW));
	if (cols.resultW > 0) {
		line += ' '.repeat(cols.detailsResultGapW);
		line += style(fit('RESULT', cols.resultW));
	}
	line += ' '.repeat(cols.gapW);
	line += '   ';
	return fitAnsi(line, innerWidth);
}

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
