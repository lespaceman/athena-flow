/**
 * Renders an AskUserQuestion event.
 *
 * When pending, shows a minimal "Question (N questions)" indicator since
 * the QuestionDialog handles the full UI. After the user answers, renders
 * the questions with their answers inline.
 */

import React from 'react';
import {Box, Text} from 'ink';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
} from '../types/hooks/index.js';
import {getStatusColors, STATUS_SYMBOLS} from './hookEventUtils.js';
import {useTheme} from '../theme/index.js';

type Props = {
	event: HookEventDisplay;
};

export default function AskUserQuestionEvent({event}: Props): React.ReactNode {
	const theme = useTheme();
	const statusColors = getStatusColors(theme);
	const color = statusColors[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

	if (!isPreToolUseEvent(payload)) return null;

	const questions = (
		payload.tool_input as {
			questions?: Array<{question: string; header: string}>;
		}
	).questions;
	const answers = (
		event.result?.stdout_json as {
			hookSpecificOutput?: {
				updatedInput?: {answers?: Record<string, string>};
			};
		}
	)?.hookSpecificOutput?.updatedInput?.answers;

	// While pending, show minimal indicator (the dialog handles the full UI)
	if (event.status === 'pending') {
		return (
			<Box marginTop={1}>
				<Text color={color}>{symbol} </Text>
				<Text color={theme.accent} bold>
					Question
				</Text>
				{questions && questions.length > 0 && (
					<Text dimColor>
						{' '}
						({questions.length} question{questions.length > 1 ? 's' : ''})
					</Text>
				)}
			</Box>
		);
	}

	// After answering, show questions with answers inline
	return (
		<Box flexDirection="column" marginTop={1}>
			<Box>
				<Text color={color}>{symbol} </Text>
				<Text color={theme.accent} bold>
					Question
				</Text>
			</Box>
			{questions?.map((q, i) => (
				<Box key={`${i}-${q.header}`} paddingLeft={3} flexDirection="column">
					<Text>
						<Text bold>[{q.header}]</Text> {q.question}
					</Text>
					{answers?.[q.question] && (
						<Text color={theme.status.success}>
							{'\u23bf  '}
							{answers[q.question]}
						</Text>
					)}
				</Box>
			))}
		</Box>
	);
}
