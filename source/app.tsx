import process from 'node:process';
import React, {useState, useCallback, useRef} from 'react';
import {Box, Static, Text, useApp} from 'ink';
import {Spinner} from '@inkjs/ui';
import Message from './components/Message.js';
import CommandInput from './components/CommandInput.js';
import PermissionDialog from './components/PermissionDialog.js';
import QuestionDialog from './components/QuestionDialog.js';
import HookEvent from './components/HookEvent.js';
import TaskList from './components/TaskList.js';
import {isPreToolUseEvent} from './types/hooks/index.js';
import {type TodoWriteInput} from './types/todo.js';
import StreamingResponse from './components/StreamingResponse.js';
import Header from './components/Header.js';
import {HookProvider, useHookContext} from './context/HookContext.js';
import {useClaudeProcess} from './hooks/useClaudeProcess.js';
import {type InputHistory, useInputHistory} from './hooks/useInputHistory.js';
import {
	type Message as MessageType,
	type IsolationConfig,
	generateId,
} from './types/index.js';
import {useContentOrdering} from './hooks/useContentOrdering.js';
import {type PermissionDecision} from './types/server.js';
import {parseInput} from './commands/parser.js';
import {executeCommand} from './commands/executor.js';
import {getAgentChain} from './utils/agentChain.js';

type Props = {
	projectDir: string;
	instanceId: number;
	isolation?: IsolationConfig;
	verbose?: boolean;
	version: string;
	pluginMcpConfig?: string;
};

function AppContent({
	projectDir,
	instanceId,
	isolation,
	verbose,
	version,
	pluginMcpConfig,
	onClear,
	inputHistory,
}: Props & {onClear: () => void; inputHistory: InputHistory}) {
	const [inputKey, setInputKey] = useState(0);
	const [messages, setMessages] = useState<MessageType[]>([]);
	const [taskListCollapsed, setTaskListCollapsed] = useState(false);
	const toggleTaskList = useCallback(() => {
		setTaskListCollapsed(c => !c);
	}, []);
	const messagesRef = useRef(messages);
	messagesRef.current = messages;
	const hookServer = useHookContext();
	const {
		events,
		isServerRunning,
		socketPath,
		currentSessionId,
		currentPermissionRequest,
		permissionQueueCount,
		resolvePermission,
		currentQuestionRequest,
		questionQueueCount,
		resolveQuestion,
	} = hookServer;
	const {
		spawn: spawnClaude,
		isRunning: isClaudeRunning,
		sendInterrupt,
		streamingText,
	} = useClaudeProcess(
		projectDir,
		instanceId,
		isolation,
		pluginMcpConfig,
		verbose,
	);
	const {exit} = useApp();

	const addMessage = useCallback(
		(role: 'user' | 'assistant', content: string) => {
			const newMessage: MessageType = {
				id: generateId(),
				role,
				content,
			};
			setMessages(prev => [...prev, newMessage]);
			return newMessage;
		},
		[],
	);

	const clearScreen = useCallback(() => {
		hookServer.clearEvents();
		// ANSI: clear screen + clear scrollback + cursor home
		process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
		// Force full remount so Static re-renders the header
		onClear();
	}, [hookServer, onClear]);

	const handleSubmit = useCallback(
		(value: string) => {
			if (!value.trim()) return;

			inputHistory.push(value);
			setInputKey(k => k + 1); // Reset input by changing key

			const result = parseInput(value);

			if (result.type === 'prompt') {
				addMessage('user', result.text);
				spawnClaude(result.text, currentSessionId ?? undefined);
				return;
			}

			// It's a command
			addMessage('user', value);
			const addMessageObj = (msg: MessageType) =>
				setMessages(prev => [...prev, msg]);
			executeCommand(result.command, result.args, {
				ui: {
					args: result.args,
					get messages() {
						return messagesRef.current;
					},
					setMessages,
					addMessage: addMessageObj,
					exit,
					clearScreen,
				},
				hook: {
					args: result.args,
					hookServer,
				},
				prompt: {
					spawn: spawnClaude,
					currentSessionId: currentSessionId ?? undefined,
				},
			});
		},
		[
			addMessage,
			spawnClaude,
			currentSessionId,
			hookServer,
			exit,
			clearScreen,
			inputHistory,
		],
	);

	const handlePermissionDecision = useCallback(
		(decision: PermissionDecision) => {
			if (!currentPermissionRequest) return;
			resolvePermission(currentPermissionRequest.requestId, decision);
		},
		[currentPermissionRequest, resolvePermission],
	);

	const handleQuestionAnswer = useCallback(
		(answers: Record<string, string>) => {
			if (!currentQuestionRequest) return;
			resolveQuestion(currentQuestionRequest.requestId, answers);
		},
		[currentQuestionRequest, resolveQuestion],
	);

	const handleQuestionSkip = useCallback(() => {
		if (!currentQuestionRequest) return;
		resolveQuestion(currentQuestionRequest.requestId, {});
	}, [currentQuestionRequest, resolveQuestion]);

	const {
		stableItems,
		dynamicItems,
		activeSubagents,
		childEventsByAgent,
		activeTodoList,
	} = useContentOrdering({
		messages,
		events,
	});

	return (
		<Box flexDirection="column">
			{/* Server status (verbose only) */}
			{verbose && (
				<Box marginBottom={1}>
					<Text color={isServerRunning ? 'green' : 'red'}>
						Hook server: {isServerRunning ? 'running' : 'stopped'}
					</Text>
					{socketPath && <Text dimColor> ({socketPath})</Text>}
					<Text> | </Text>
					<Text color={isClaudeRunning ? 'yellow' : 'gray'}>
						Claude: {isClaudeRunning ? 'running' : 'idle'}
					</Text>
				</Box>
			)}

			{/* Stable items - rendered once at top, never update */}
			<Static items={stableItems}>
				{item => {
					if (item.type === 'header') {
						return (
							<Header key="header" version={version} projectDir={projectDir} />
						);
					}
					return item.type === 'message' ? (
						<Message key={item.data.id} message={item.data} />
					) : (
						<HookEvent
							key={item.data.id}
							event={item.data}
							verbose={verbose}
							childEventsByAgent={childEventsByAgent}
						/>
					);
				}}
			</Static>

			{/* Dynamic items - can re-render when state changes */}
			{dynamicItems.map(item =>
				item.type === 'message' ? (
					<Message key={item.data.id} message={item.data} />
				) : (
					<HookEvent
						key={item.data.id}
						event={item.data}
						verbose={verbose}
						childEventsByAgent={childEventsByAgent}
					/>
				),
			)}

			{/* Active subagents - always dynamic, updates with child events */}
			{activeSubagents.map(event => (
				<HookEvent
					key={event.id}
					event={event}
					verbose={verbose}
					childEventsByAgent={childEventsByAgent}
				/>
			))}

			{/* Active todo list - always dynamic, shows latest state */}
			{activeTodoList &&
				(() => {
					const payload = activeTodoList.payload;
					if (!isPreToolUseEvent(payload)) return null;
					const input = payload.tool_input as TodoWriteInput;
					const todos = Array.isArray(input.todos) ? input.todos : [];
					return (
						<TaskList
							tasks={todos}
							collapsed={taskListCollapsed}
							onToggle={toggleTaskList}
						/>
					);
				})()}

			{verbose && streamingText && (
				<StreamingResponse text={streamingText} isStreaming={isClaudeRunning} />
			)}

			{isClaudeRunning &&
				!currentPermissionRequest &&
				!currentQuestionRequest && (
					<Box>
						<Spinner label="Agent is thinking..." />
					</Box>
				)}

			{/* Permission dialog - shown when a dangerous tool needs approval */}
			{currentPermissionRequest && (
				<PermissionDialog
					request={currentPermissionRequest}
					queuedCount={permissionQueueCount - 1}
					onDecision={handlePermissionDecision}
					agentChain={getAgentChain(
						events,
						currentPermissionRequest.parentSubagentId,
					)}
				/>
			)}

			{/* Question dialog - shown when AskUserQuestion needs answers */}
			{currentQuestionRequest && !currentPermissionRequest && (
				<QuestionDialog
					request={currentQuestionRequest}
					queuedCount={questionQueueCount - 1}
					onAnswer={handleQuestionAnswer}
					onSkip={handleQuestionSkip}
				/>
			)}

			<CommandInput
				inputKey={inputKey}
				onSubmit={handleSubmit}
				disabled={
					currentPermissionRequest !== null || currentQuestionRequest !== null
				}
				disabledMessage={
					currentQuestionRequest && !currentPermissionRequest
						? 'Waiting for your input...'
						: undefined
				}
				onEscape={isClaudeRunning ? sendInterrupt : undefined}
				onArrowUp={inputHistory.back}
				onArrowDown={inputHistory.forward}
			/>
		</Box>
	);
}

export default function App({
	projectDir,
	instanceId,
	isolation,
	verbose,
	version,
	pluginMcpConfig,
}: Props) {
	const [clearCount, setClearCount] = useState(0);
	const inputHistory = useInputHistory();

	return (
		<HookProvider projectDir={projectDir} instanceId={instanceId}>
			<AppContent
				key={clearCount}
				projectDir={projectDir}
				instanceId={instanceId}
				isolation={isolation}
				verbose={verbose}
				version={version}
				pluginMcpConfig={pluginMcpConfig}
				onClear={() => setClearCount(c => c + 1)}
				inputHistory={inputHistory}
			/>
		</HookProvider>
	);
}
