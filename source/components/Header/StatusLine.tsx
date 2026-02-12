import React from 'react';
import {Box, Text} from 'ink';
import {
	formatTokens,
	formatModelName,
	shortenPath,
} from '../../utils/formatters.js';
import type {ClaudeState} from '../../types/headerMetrics.js';
import {getStateColors, STATE_LABELS} from './constants.js';
import {useTheme} from '../../theme/index.js';

type Props = {
	isServerRunning: boolean;
	socketPath: string | null;
	claudeState: ClaudeState;
	verbose: boolean;
	spinnerFrame: string;
	modelName: string | null;
	toolCallCount: number;
	contextSize: number | null;
	projectDir: string;
};

export default function StatusLine({
	isServerRunning,
	socketPath,
	claudeState,
	verbose,
	spinnerFrame,
	modelName,
	toolCallCount,
	contextSize,
	projectDir,
}: Props) {
	const theme = useTheme();
	const stateColors = getStateColors(theme);

	return (
		<Box justifyContent="space-between" width="100%" marginTop={1} paddingX={1}>
			<Box>
				{verbose && (
					<>
						<Text
							color={
								isServerRunning ? theme.status.success : theme.status.error
							}
						>
							Hook server: {isServerRunning ? 'running' : 'stopped'}
						</Text>
						<Text dimColor> | </Text>
					</>
				)}
				<Text color={stateColors[claudeState]}>
					{spinnerFrame ? `${spinnerFrame} ` : ''}
					Athena: {STATE_LABELS[claudeState]}
				</Text>
				<Text dimColor> | </Text>
				<Text dimColor>{shortenPath(projectDir)}</Text>
			</Box>
			<Box>
				<Text>{formatModelName(modelName)}</Text>
				<Text dimColor> | Tools: </Text>
				<Text>{toolCallCount}</Text>
				<Text dimColor> | Context: </Text>
				<Text>{formatTokens(contextSize)}</Text>
			</Box>
		</Box>
	);
}
