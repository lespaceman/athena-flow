import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {type SessionEntry} from '../../utils/sessionIndex';
import {formatRelativeTime} from '../../utils/formatters';
import {useTheme} from '../theme/index';
import {startInputMeasure} from '../../utils/perf';

type Props = {
	sessions: SessionEntry[];
	onSelect: (sessionId: string) => void;
	onCancel: () => void;
};

const VISIBLE_COUNT = 15;

export default function SessionPicker({sessions, onSelect, onCancel}: Props) {
	const theme = useTheme();
	const [focusIndex, setFocusIndex] = useState(0);

	useInput((input, key) => {
		const done = startInputMeasure('session.picker', input, key);
		try {
			if (key.downArrow) {
				setFocusIndex(i => Math.min(i + 1, sessions.length - 1));
			} else if (key.upArrow) {
				setFocusIndex(i => Math.max(i - 1, 0));
			} else if (key.return) {
				const session = sessions[focusIndex];
				if (session) {
					onSelect(session.sessionId);
				}
			} else if (key.escape) {
				onCancel();
			}
		} finally {
			done();
		}
	});

	if (sessions.length === 0) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text dimColor>No previous sessions found.</Text>
			</Box>
		);
	}

	const scrollStart = Math.max(
		0,
		Math.min(
			focusIndex - Math.floor(VISIBLE_COUNT / 2),
			sessions.length - VISIBLE_COUNT,
		),
	);
	const visible = sessions.slice(scrollStart, scrollStart + VISIBLE_COUNT);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color={theme.accent}>
					Sessions
				</Text>
			</Box>

			{visible.map((session, vi) => {
				const realIndex = scrollStart + vi;
				const isFocused = realIndex === focusIndex;
				const branch = session.gitBranch || 'no branch';
				const time = formatRelativeTime(session.modified);
				const meta = `${branch} · ${time} · ${session.messageCount} messages`;

				return (
					<Box key={session.sessionId} flexDirection="column">
						<Box>
							<Text color={isFocused ? 'cyan' : undefined} bold={isFocused}>
								{isFocused ? '> ' : '  '}
								{session.summary || session.firstPrompt}
							</Text>
						</Box>
						<Box paddingLeft={2}>
							<Text dimColor>{meta}</Text>
						</Box>
					</Box>
				);
			})}

			<Box marginTop={1}>
				<Text dimColor>up/down Navigate Enter Select Esc Cancel</Text>
			</Box>
		</Box>
	);
}
