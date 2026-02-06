import React from 'react';
import {Box, Text, useInput} from 'ink';
import {useSpinner} from '../hooks/useSpinner.js';
import {type TodoItem} from '../types/todo.js';

type Props = {
	tasks: TodoItem[];
	collapsed?: boolean;
	onToggle?: () => void;
};

// -- State rendering constants ------------------------------------------------

const STATE_SYMBOLS = {
	completed: '\u2713',
	in_progress: '', // Replaced by spinner
	pending: '\u00b7',
	failed: '\u2717',
} as const;

const STATE_COLORS = {
	completed: 'green',
	in_progress: 'cyan',
	pending: 'gray',
	failed: 'red',
} as const;

// -- Sub-components -----------------------------------------------------------

function TaskItem({
	task,
	spinnerFrame,
}: {
	task: TodoItem;
	spinnerFrame: string;
}) {
	const color = STATE_COLORS[task.status];
	const symbol =
		task.status === 'in_progress' ? spinnerFrame : STATE_SYMBOLS[task.status];
	const isDim = task.status === 'pending';
	const isFailed = task.status === 'failed';

	return (
		<Box>
			<Text color={color}>{symbol} </Text>
			<Text dimColor={isDim} color={isFailed ? 'red' : undefined}>
				{task.content}
			</Text>
			{isFailed && <Text color="red"> — failed</Text>}
			{task.status === 'in_progress' && task.activeForm && (
				<Text dimColor> {task.activeForm}</Text>
			)}
		</Box>
	);
}

// -- Main component -----------------------------------------------------------

export default function TaskList({tasks, collapsed = false, onToggle}: Props) {
	const hasInProgress = tasks.some(t => t.status === 'in_progress');
	const spinnerFrame = useSpinner(hasInProgress);

	useInput(
		(input, key) => {
			if (input === 't' && key.ctrl && onToggle) {
				onToggle();
			}
		},
		{isActive: !!onToggle},
	);

	const completedCount = tasks.filter(t => t.status === 'completed').length;
	const totalCount = tasks.length;
	const toggleIndicator = collapsed ? '\u25b6' : '\u25bc';

	const inProgressTask = tasks.find(t => t.status === 'in_progress');
	const failedTask = tasks.find(t => t.status === 'failed');
	const allDone = totalCount > 0 && completedCount === totalCount;

	// -- Collapsed view -------------------------------------------------------

	if (collapsed) {
		let statusText: React.ReactNode;
		if (failedTask) {
			statusText = (
				<Text color="red">
					{'\u2717'} Failed: {failedTask.content}
				</Text>
			);
		} else if (allDone) {
			statusText = <Text color="green">{'\u2713'} Done</Text>;
		} else if (inProgressTask) {
			statusText = (
				<Text color="cyan">
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
				{tasks.length === 0 ? (
					<Text dimColor>(no tasks)</Text>
				) : (
					tasks.map((task, i) => (
						<TaskItem
							key={`${i}-${task.content}`}
							task={task}
							spinnerFrame={spinnerFrame}
						/>
					))
				)}
			</Box>
		</Box>
	);
}
