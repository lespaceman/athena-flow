import React from 'react';
import {Box, Text, useInput} from 'ink';
import {useSpinner} from '../hooks/useSpinner';
import {type TodoItem} from '../../types/todo';
import {useTheme} from '../theme/index';
import {getGlyphs} from '../glyphs/index';

type Props = {
	tasks: TodoItem[];
	collapsed?: boolean;
	onToggle?: () => void;
	dialogActive?: boolean;
};

// -- State rendering constants ------------------------------------------------

const g = getGlyphs();

const STATE_SYMBOLS = {
	completed: g['task.completed'],
	in_progress: '', // Replaced by spinner
	pending: g['task.pending'],
	failed: g['task.failed'],
} as const;

// -- Sub-components -----------------------------------------------------------

function TaskItem({
	task,
	spinnerFrame,
}: {
	task: TodoItem;
	spinnerFrame: string;
}) {
	const theme = useTheme();
	const stateColors = {
		completed: theme.status.success,
		in_progress: theme.status.working,
		pending: theme.status.neutral,
		failed: theme.status.error,
	};
	const color = stateColors[task.status];
	const symbol =
		task.status === 'in_progress' ? spinnerFrame : STATE_SYMBOLS[task.status];
	const isDim = task.status === 'pending';
	const isFailed = task.status === 'failed';

	return (
		<Box>
			<Text color={color}>{symbol} </Text>
			<Text dimColor={isDim} color={isFailed ? theme.status.error : undefined}>
				{task.content}
			</Text>
			{isFailed && <Text color={theme.status.error}> — failed</Text>}
			{task.status === 'in_progress' && task.activeForm && (
				<Text dimColor> {task.activeForm}</Text>
			)}
		</Box>
	);
}

// -- Main component -----------------------------------------------------------

export default function TaskList({
	tasks,
	collapsed = false,
	onToggle,
	dialogActive,
}: Props) {
	const theme = useTheme();
	const hasInProgress = tasks.some(t => t.status === 'in_progress');
	const spinnerFrame = useSpinner(hasInProgress);

	useInput(
		(input, key) => {
			if (input === 't' && key.ctrl && onToggle) {
				onToggle();
			}
		},
		{isActive: !!onToggle && !dialogActive},
	);

	if (tasks.length === 0) return null;

	const completedCount = tasks.filter(t => t.status === 'completed').length;
	const totalCount = tasks.length;
	const toggleIndicator = collapsed ? g['task.collapsed'] : g['task.expanded'];

	const inProgressTask = tasks.find(t => t.status === 'in_progress');
	const failedTask = tasks.find(t => t.status === 'failed');
	const allDone = totalCount > 0 && completedCount === totalCount;

	// -- Collapsed view -------------------------------------------------------

	if (collapsed) {
		let statusText: React.ReactNode;
		if (failedTask) {
			statusText = (
				<Text color={theme.status.error}>
					{g['task.failed']} Failed: {failedTask.content}
				</Text>
			);
		} else if (allDone) {
			statusText = (
				<Text color={theme.status.success}>{g['task.completed']} Done</Text>
			);
		} else if (inProgressTask) {
			statusText = (
				<Text color={theme.status.working}>
					{spinnerFrame} {inProgressTask.activeForm ?? inProgressTask.content}
				</Text>
			);
		}

		return (
			<Box marginBottom={1}>
				<Text dimColor>{toggleIndicator} </Text>
				<Text bold>Tasks</Text>
				<Text dimColor>
					{' '}
					({completedCount}/{totalCount})
				</Text>
				{statusText && <Text> </Text>}
				{statusText}
			</Box>
		);
	}

	// -- Expanded view --------------------------------------------------------

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text dimColor>{toggleIndicator} </Text>
				<Text bold>Tasks</Text>
				<Text dimColor>
					{' '}
					({completedCount}/{totalCount})
				</Text>
			</Box>
			<Box flexDirection="column" paddingLeft={2}>
				{tasks.map((task, i) => (
					<TaskItem
						key={`${i}-${task.content}`}
						task={task}
						spinnerFrame={spinnerFrame}
					/>
				))}
			</Box>
		</Box>
	);
}
