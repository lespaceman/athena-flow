import React from 'react';
import {Box, Text} from 'ink';
import chalk from 'chalk';
import {formatModelName} from '../../utils/formatters.js';
import {renderContextBar} from '../../utils/contextBar.js';
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
	contextMax?: number;
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
	contextMax,
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
				<Text dimColor> | </Text>
				<Text>
					{renderContextBar(
						contextSize,
						contextMax ?? 200_000,
						20,
						chalk.level > 0,
					)}
				</Text>
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
