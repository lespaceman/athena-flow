import process from 'node:process';
import React, {useState, useCallback, useRef} from 'react';
import {Box, Text, Static, useApp, useInput, useStdout} from 'ink';
import Message from './components/Message.js';
import CommandInput from './components/CommandInput.js';
import PermissionDialog from './components/PermissionDialog.js';
import QuestionDialog from './components/QuestionDialog.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import HookEvent from './components/HookEvent.js';
import TaskList from './components/TaskList.js';
import StreamingResponse from './components/StreamingResponse.js';
import StatusLine from './components/Header/StatusLine.js';
import StatsPanel from './components/Header/StatsPanel.js';
import Header from './components/Header/Header.js';
import {HookProvider, useHookContext} from './context/HookContext.js';
import {useClaudeProcess} from './hooks/useClaudeProcess.js';
import {useHeaderMetrics} from './hooks/useHeaderMetrics.js';
import {useDuration} from './hooks/useDuration.js';
import {useSpinner} from './hooks/useSpinner.js';
import {appModeToClaudeState} from './types/headerMetrics.js';
import {useAppMode} from './hooks/useAppMode.js';
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
	modelName: string | null;
	claudeCodeVersion: string | null;
};

/** Fallback for crashed PermissionDialog — lets user press Escape to deny. */
function PermissionErrorFallback({onDeny}: {onDeny: () => void}) {
	useInput((_input, key) => {
		if (key.escape) onDeny();
	});
	return (
		<Text color="red">
			[Permission dialog error — press Escape to deny and continue]
		</Text>
	);
}

/** Fallback for crashed QuestionDialog — lets user press Escape to skip. */
function QuestionErrorFallback({onSkip}: {onSkip: () => void}) {
	useInput((_input, key) => {
		if (key.escape) onSkip();
	});
	return (
		<Text color="red">
			[Question dialog error — press Escape to skip and continue]
		</Text>
	);
}

function AppContent({
	projectDir,
	instanceId,
	isolation,
	verbose,
	version,
	pluginMcpConfig,
	modelName,
	claudeCodeVersion,
	onClear,
	inputHistory,
}: Props & {onClear: () => void; inputHistory: InputHistory}) {
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
		tokenUsage,
	} = useClaudeProcess(
		projectDir,
		instanceId,
		isolation,
		pluginMcpConfig,
		verbose,
	);
	const {exit} = useApp();

	const metrics = useHeaderMetrics(events);
	const elapsed = useDuration(metrics.sessionStartTime);

	const addMessage = useCallback(
		(role: 'user' | 'assistant', content: string) => {
			const newMessage: MessageType = {
				id: generateId(),
				role,
				content,
				timestamp: new Date(),
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
					sessionStats: {
						metrics: {
							...metrics,
							modelName: metrics.modelName || modelName,
							tokens: tokenUsage,
						},
						tokens: tokenUsage,
						elapsed,
					},
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
			metrics,
			modelName,
			tokenUsage,
			elapsed,
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
		tasks,
	} = useContentOrdering({
		messages,
		events,
	});

	const appMode = useAppMode(
		isClaudeRunning,
		currentPermissionRequest,
		currentQuestionRequest,
	);
	const claudeState = appModeToClaudeState(appMode);
	const dialogActive =
		appMode.type === 'permission' || appMode.type === 'question';
	const spinnerFrame = useSpinner(claudeState === 'working');

	const [statsExpanded, setStatsExpanded] = useState(false);
	const {stdout} = useStdout();
	const terminalWidth = stdout?.columns ?? 80;

	useInput(
		(_input, key) => {
			if (key.ctrl && _input === 's') {
				setStatsExpanded(prev => !prev);
			}
		},
		{isActive: !dialogActive},
	);

	type StaticItem = {type: 'header'; id: string} | (typeof stableItems)[number];
	const allStaticItems: StaticItem[] = [
		{type: 'header', id: 'header'},
		...stableItems,
	];

	return (
		<Box flexDirection="column">
			{/* Static items — header identity + stable events/messages */}
			<Static items={allStaticItems}>
				{item => {
					if (item.type === 'header') {
						return (
							<Header
								key="header"
								version={version}
								modelName={modelName}
								projectDir={projectDir}
								terminalWidth={terminalWidth}
							/>
						);
					}
					return item.type === 'message' ? (
						<Message key={item.data.id} message={item.data} />
					) : (
						<ErrorBoundary
							key={item.data.id}
							fallback={<Text color="red">[Error rendering event]</Text>}
						>
							<HookEvent
								event={item.data}
								verbose={verbose}
								childEventsByAgent={childEventsByAgent}
							/>
						</ErrorBoundary>
					);
				}}
			</Static>

			{/* Stats panel — toggled with Ctrl+s, shows detailed metrics */}
			{statsExpanded && (
				<StatsPanel
					metrics={{...metrics, tokens: tokenUsage}}
					elapsed={elapsed}
					terminalWidth={terminalWidth}
				/>
			)}

			{/* Dynamic items - can re-render when state changes */}
			{dynamicItems.map(item =>
				item.type === 'message' ? (
					<Message key={item.data.id} message={item.data} />
				) : (
					<ErrorBoundary
						key={item.data.id}
						fallback={<Text color="red">[Error rendering event]</Text>}
					>
						<HookEvent
							event={item.data}
							verbose={verbose}
							childEventsByAgent={childEventsByAgent}
						/>
					</ErrorBoundary>
				),
			)}

			{/* Active subagents - always dynamic, updates with child events */}
			{activeSubagents.map(event => (
				<ErrorBoundary
					key={event.id}
					fallback={<Text color="red">[Error rendering event]</Text>}
				>
					<HookEvent
						event={event}
						verbose={verbose}
						childEventsByAgent={childEventsByAgent}
					/>
				</ErrorBoundary>
			))}

			{/* Active task list - always dynamic, shows latest state */}
			<TaskList
				tasks={tasks}
				collapsed={taskListCollapsed}
				onToggle={toggleTaskList}
				dialogActive={dialogActive}
			/>

			{verbose && streamingText && (
				<StreamingResponse text={streamingText} isStreaming={isClaudeRunning} />
			)}

			{/* Permission dialog - shown when a dangerous tool needs approval */}
			{appMode.type === 'permission' && currentPermissionRequest && (
				<ErrorBoundary
					fallback={
						<PermissionErrorFallback
							onDeny={() => handlePermissionDecision('deny')}
						/>
					}
				>
					<PermissionDialog
						request={currentPermissionRequest}
						queuedCount={permissionQueueCount - 1}
						onDecision={handlePermissionDecision}
						agentChain={getAgentChain(
							events,
							currentPermissionRequest.parentSubagentId,
						)}
					/>
				</ErrorBoundary>
			)}

			{/* Question dialog - shown when AskUserQuestion needs answers */}
			{appMode.type === 'question' && currentQuestionRequest && (
				<ErrorBoundary
					fallback={<QuestionErrorFallback onSkip={handleQuestionSkip} />}
				>
					<QuestionDialog
						request={currentQuestionRequest}
						queuedCount={questionQueueCount - 1}
						onAnswer={handleQuestionAnswer}
						onSkip={handleQuestionSkip}
					/>
				</ErrorBoundary>
			)}

			<CommandInput
				onSubmit={handleSubmit}
				disabled={dialogActive}
				disabledMessage={
					appMode.type === 'question' ? 'Waiting for your input...' : undefined
				}
				onEscape={isClaudeRunning ? sendInterrupt : undefined}
				onArrowUp={inputHistory.back}
				onArrowDown={inputHistory.forward}
			/>

			{/* Status line — always visible at bottom */}
			<StatusLine
				isServerRunning={isServerRunning}
				socketPath={socketPath ?? null}
				claudeState={claudeState}
				verbose={verbose ?? false}
				spinnerFrame={spinnerFrame}
				modelName={metrics.modelName || modelName}
				toolCallCount={metrics.totalToolCallCount}
				tokenTotal={tokenUsage.total}
				projectDir={projectDir}
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
	modelName,
	claudeCodeVersion,
}: Props) {
	const [clearCount, setClearCount] = useState(0);
	const inputHistory = useInputHistory(projectDir);

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
				modelName={modelName}
				claudeCodeVersion={claudeCodeVersion}
				onClear={() => setClearCount(c => c + 1)}
				inputHistory={inputHistory}
			/>
		</HookProvider>
	);
}
