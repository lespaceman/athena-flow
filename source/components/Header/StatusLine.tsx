import React from 'react';
import {Box, Text} from 'ink';
import {
	formatTokens,
	formatModelName,
	shortenPath,
} from '../../utils/formatters.js';
import type {ClaudeState} from '../../types/headerMetrics.js';
import {STATE_COLORS, STATE_LABELS} from './constants.js';

type Props = {
	isServerRunning: boolean;
	socketPath: string | null;
	claudeState: ClaudeState;
	verbose: boolean;
	spinnerFrame: string;
	modelName: string | null;
	toolCallCount: number;
	tokenTotal: number | null;
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
	tokenTotal,
	projectDir,
}: Props) {
	return (
		<Box justifyContent="space-between" width="100%" marginTop={1} paddingX={1}>
			<Box>
				<Text color={isServerRunning ? 'green' : 'red'}>
					Hook server: {isServerRunning ? 'running' : 'stopped'}
				</Text>
				{verbose && socketPath && <Text dimColor> ({socketPath})</Text>}
				<Text dimColor> | </Text>
				<Text color={STATE_COLORS[claudeState]}>
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
				<Text dimColor> | Tokens: </Text>
				<Text>{formatTokens(tokenTotal)}</Text>
			</Box>
		</Box>
	);
}
