import process from 'node:process';
import React, {useState, useCallback, useRef} from 'react';
import {Box, Static, Text, useApp} from 'ink';
import {Spinner} from '@inkjs/ui';
import Message from './components/Message.js';
import CommandInput from './components/CommandInput.js';
import PermissionDialog from './components/PermissionDialog.js';
import QuestionDialog from './components/QuestionDialog.js';
import HookEvent from './components/HookEvent.js';
import StreamingResponse from './components/StreamingResponse.js';
import Header from './components/Header.js';
import {HookProvider, useHookContext} from './context/HookContext.js';
import {useClaudeProcess} from './hooks/useClaudeProcess.js';
import {type InputHistory, useInputHistory} from './hooks/useInputHistory.js';
import {
	type Message as MessageType,
	type HookEventDisplay,
	type IsolationPreset,
	generateId,
} from './types/index.js';
import {type PermissionDecision} from './types/server.js';
import {parseInput} from './commands/parser.js';
import {executeCommand} from './commands/executor.js';

type Props = {
	projectDir: string;
	instanceId: number;
	isolation?: IsolationPreset;
	debug?: boolean;
	version: string;
	pluginMcpConfig?: string;
};

type ContentItem =
	| {type: 'message'; data: MessageType}
	| {type: 'hook'; data: HookEventDisplay};

type DisplayItem = {type: 'header'; id: string} | ContentItem;

function AppContent({
	projectDir,
	instanceId,
	isolation,
	debug,
	version,
	pluginMcpConfig,
	onClear,
	inputHistory,
}: Props & {onClear: () => void; inputHistory: InputHistory}) {
	const [inputKey, setInputKey] = useState(0);
	const [messages, setMessages] = useState<MessageType[]>([]);
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
		debug,
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

	// Convert SessionEnd events with transcript text into synthetic assistant messages
	const sessionEndMessages: ContentItem[] = debug
		? []
		: events
				.filter(
					e =>
						e.hookName === 'SessionEnd' &&
						e.transcriptSummary?.lastAssistantText,
				)
				.map(e => ({
					type: 'message' as const,
					data: {
						id: `${e.timestamp.getTime()}-session-end-${e.id}`,
						role: 'assistant' as const,
						content: e.transcriptSummary!.lastAssistantText!,
					},
				}));

	// Interleave messages and hook events by timestamp.
	// In non-debug mode, exclude SessionEnd (rendered as synthetic assistant messages instead).
	const hookItems: ContentItem[] = events
		.filter(e => debug || e.hookName !== 'SessionEnd')
		.map(e => ({type: 'hook' as const, data: e}));

	const getItemTime = (item: ContentItem): number =>
		item.type === 'message'
			? Number.parseInt(item.data.id.split('-')[0] ?? '0', 10)
			: item.data.timestamp.getTime();

	const contentItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...sessionEndMessages,
	].sort((a, b) => getItemTime(a) - getItemTime(b));

	// Separate stable items (for Static) from items that may update (rendered dynamically).
	// An item is "stable" once it will no longer change and can be rendered once by <Static>.
	const isStableContent = (item: ContentItem): boolean => {
		if (item.type === 'message') return true;

		switch (item.data.hookName) {
			case 'SessionEnd':
				// Stable once transcript data has loaded
				return item.data.transcriptSummary !== undefined;
			case 'PreToolUse':
			case 'PermissionRequest':
				// AskUserQuestion: stable once answered (no PostToolUse expected)
				if (item.data.toolName === 'AskUserQuestion') {
					return item.data.status !== 'pending';
				}
				// Stable when blocked (no PostToolUse expected) or when PostToolUse merged in.
				// Keep dynamic until then so <Static> does not freeze before the response appears.
				return (
					item.data.status === 'blocked' ||
					item.data.postToolPayload !== undefined
				);
			case 'SubagentStart':
				// Stable when blocked or when SubagentStop has been merged in.
				return (
					item.data.status === 'blocked' ||
					item.data.subagentStopPayload !== undefined
				);
			default:
				return item.data.status !== 'pending';
		}
	};

	const stableItems: DisplayItem[] = [
		{type: 'header', id: 'header'},
		...contentItems.filter(isStableContent),
	];
	const dynamicItems = contentItems.filter(item => !isStableContent(item));

	return (
		<Box flexDirection="column">
			{/* Server status (debug only) */}
			{debug && (
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
						<HookEvent key={item.data.id} event={item.data} debug={debug} />
					);
				}}
			</Static>

			{/* Dynamic items - can re-render when state changes */}
			{dynamicItems.map(item =>
				item.type === 'message' ? (
					<Message key={item.data.id} message={item.data} />
				) : (
					<HookEvent key={item.data.id} event={item.data} debug={debug} />
				),
			)}

			{debug && streamingText && (
				<StreamingResponse text={streamingText} isStreaming={isClaudeRunning} />
			)}

			{isClaudeRunning && (
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
				/>
			)}

			{/* Question dialog - shown when AskUserQuestion needs answers */}
			{currentQuestionRequest && !currentPermissionRequest && (
				<QuestionDialog
					request={currentQuestionRequest}
					queuedCount={questionQueueCount - 1}
					onAnswer={handleQuestionAnswer}
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
						? 'Answering question...'
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
	debug,
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
				debug={debug}
				version={version}
				pluginMcpConfig={pluginMcpConfig}
				onClear={() => setClearCount(c => c + 1)}
				inputHistory={inputHistory}
			/>
		</HookProvider>
	);
}
