import React from 'react';
import {Box, Text} from 'ink';
import {formatTokens, formatModelName} from '../../utils/formatters.js';
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
}: Props) {
	return (
		<Box>
			<Text color={isServerRunning ? 'green' : 'red'}>
				Hook server: {isServerRunning ? 'running' : 'stopped'}
			</Text>
			{verbose && socketPath && <Text dimColor> ({socketPath})</Text>}
			<Text dimColor> | </Text>
			<Text color={STATE_COLORS[claudeState]}>
				{spinnerFrame ? `${spinnerFrame} ` : ''}
				Claude: {STATE_LABELS[claudeState]}
			</Text>
			<Text dimColor> | </Text>
			<Text>{formatModelName(modelName)}</Text>
			<Text dimColor> | Tools: </Text>
			<Text>{toolCallCount}</Text>
			<Text dimColor> | Tokens: </Text>
			<Text>{formatTokens(tokenTotal)}</Text>
		</Box>
	);
}
