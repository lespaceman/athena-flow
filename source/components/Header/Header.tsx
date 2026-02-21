import React from 'react';
import {Box, Text} from 'ink';
import {formatTokens, formatModelName} from '../../utils/formatters.js';
import type {ClaudeState} from '../../types/headerMetrics.js';
import {getStateColors, STATE_LABELS} from './constants.js';
import {useTheme} from '../../theme/index.js';
import {getGlyphs} from '../../glyphs/index.js';

const g = getGlyphs();

type Props = {
	version: string;
	modelName: string | null;
	projectDir: string;
	terminalWidth: number;
	claudeState: ClaudeState;
	spinnerFrame: string;
	toolCallCount: number;
	contextSize: number | null;
	isServerRunning: boolean;
};

export default function Header({
	version,
	modelName,
	terminalWidth,
	claudeState,
	spinnerFrame,
	toolCallCount,
	contextSize,
	isServerRunning,
}: Props) {
	const theme = useTheme();
	const stateColors = getStateColors(theme);

	return (
		<Box width={terminalWidth} justifyContent="space-between">
			<Box>
				<Text bold color={theme.accent}>
					ATHENA
				</Text>
				<Text dimColor> v{version}</Text>
				<Text dimColor> | </Text>
				<Text color={stateColors[claudeState]}>
					{spinnerFrame ? `${spinnerFrame} ` : ''}
					{STATE_LABELS[claudeState]}
				</Text>
			</Box>
			<Box>
				<Text>{formatModelName(modelName)}</Text>
				<Text dimColor> | tools:</Text>
				<Text>{toolCallCount}</Text>
				<Text dimColor> | ctx:</Text>
				<Text>{formatTokens(contextSize)}</Text>
				<Text dimColor> | </Text>
				<Text
					color={isServerRunning ? theme.status.success : theme.status.error}
				>
					{g['status.active']}
				</Text>
			</Box>
		</Box>
	);
}
