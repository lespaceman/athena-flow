import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {type SessionEntry} from '../utils/sessionIndex.js';

type Props = {
	sessions: SessionEntry[];
	onSelect: (sessionId: string) => void;
	onCancel: () => void;
};

const VISIBLE_COUNT = 15;

function formatRelativeTime(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return `${Math.floor(days / 30)}mo ago`;
}

export default function SessionPicker({sessions, onSelect, onCancel}: Props) {
	const [focusIndex, setFocusIndex] = useState(0);

	useInput((_input, key) => {
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
				<Text bold color="cyan">
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
								{isFocused ? '▸ ' : '  '}
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
				<Text dimColor>↑/↓ Navigate Enter Select Esc Cancel</Text>
			</Box>
		</Box>
	);
}

export {formatRelativeTime};
