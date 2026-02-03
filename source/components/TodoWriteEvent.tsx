/**
 * Renders a TodoWrite (TaskCreate/TaskUpdate) hook event as a visual task list
 * using ink-task-list.
 *
 * Maps TodoItem statuses to ink-task-list states:
 *   pending     -> "pending"
 *   in_progress -> "loading" (with spinner)
 *   completed   -> "success"
 */

import React from 'react';
import {Box, Text} from 'ink';
import {TaskList, Task} from 'ink-task-list';
import cliSpinners from 'cli-spinners';
import {
	type HookEventDisplay,
	isPreToolUseEvent,
} from '../types/hooks/index.js';
import {STATUS_COLORS, STATUS_SYMBOLS} from './hookEventUtils.js';
import {type TodoItem, type TodoWriteInput} from '../types/todo.js';

type Props = {
	event: HookEventDisplay;
};

function TodoTask({todo}: {todo: TodoItem}) {
	if (todo.status === 'in_progress') {
		return (
			<Task
				label={todo.content}
				state="loading"
				spinner={cliSpinners.dots}
				status={todo.activeForm}
			/>
		);
	}
	return (
		<Task
			label={todo.content}
			state={todo.status === 'completed' ? 'success' : 'pending'}
		/>
	);
}

export default function TodoWriteEvent({event}: Props): React.ReactNode {
	const color = STATUS_COLORS[event.status];
	const symbol = STATUS_SYMBOLS[event.status];
	const payload = event.payload;

	if (!isPreToolUseEvent(payload)) return null;

	const input = payload.tool_input as TodoWriteInput;
	const todos = Array.isArray(input.todos) ? input.todos : [];

	if (todos.length === 0) {
		return (
			<Box marginBottom={1}>
				<Text color={color}>{symbol} </Text>
				<Text color="cyan" bold>
					Tasks
				</Text>
				<Text dimColor> (no tasks)</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={color}>{symbol} </Text>
				<Text color="cyan" bold>
					Tasks
				</Text>
			</Box>
			<Box paddingLeft={3}>
				<TaskList>
					{todos.map((todo, i) => (
						<TodoTask key={`${i}-${todo.content}`} todo={todo} />
					))}
				</TaskList>
			</Box>
		</Box>
	);
}
