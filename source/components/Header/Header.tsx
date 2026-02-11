import React from 'react';
import {Box, Text} from 'ink';
import {LOGO_LINES, TIPS} from './constants.js';
import {formatModelName, shortenPath} from '../../utils/formatters.js';
import {useTheme} from '../../theme/index.js';

type Props = {
	version: string;
	modelName: string | null;
	projectDir: string;
	terminalWidth: number;
};

const NARROW_THRESHOLD = 80;
export default function Header({
	version,
	modelName,
	projectDir,
	terminalWidth,
}: Props) {
	const isWide = terminalWidth >= NARROW_THRESHOLD;
	const theme = useTheme();

	return (
		<Box
			borderStyle="round"
			borderColor={theme.border}
			paddingX={2}
			paddingY={1}
			flexDirection="row"
			width={terminalWidth}
		>
			{/* Left panel: logo + identity in a row */}
			<Box
				flexDirection="row"
				flexGrow={2}
				flexBasis={isWide ? '40%' : undefined}
			>
				<Box flexDirection="column" flexShrink={0} marginRight={2}>
					{LOGO_LINES.map((line, i) => (
						<Text key={i} color={theme.accent}>
							{line}
						</Text>
					))}
				</Box>
				<Box flexDirection="column">
					<Text bold color={theme.accent}>
						Welcome back!
					</Text>
					<Text wrap="truncate">
						<Text bold>{formatModelName(modelName)}</Text>
						<Text dimColor>{' · Athena v' + version}</Text>
					</Text>
					<Text dimColor wrap="truncate">
						{shortenPath(projectDir)}
					</Text>
				</Box>
			</Box>

			{/* Vertical divider + right panel (wide only) */}
			{isWide && (
				<>
					<Box
						flexShrink={0}
						borderStyle="single"
						borderLeft
						borderRight={false}
						borderTop={false}
						borderBottom={false}
						borderColor={theme.textMuted}
						marginX={1}
						height="100%"
					/>

					<Box flexDirection="column" flexGrow={3} flexBasis="60%">
						<Text bold>Tips for getting started</Text>
						{TIPS.map((tip, i) => (
							<Text key={i} dimColor>
								{'  · ' + tip}
							</Text>
						))}
					</Box>
				</>
			)}
		</Box>
	);
}
