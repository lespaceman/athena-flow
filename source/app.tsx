import process from 'node:process';
import React, {useState, useCallback, useRef} from 'react';
import {Box, Static, Text, useApp} from 'ink';
import {Spinner} from '@inkjs/ui';
import Message from './components/Message.js';
import CommandInput from './components/CommandInput.js';
import HookEvent from './components/HookEvent.js';
import Header from './components/Header.js';
import {HookProvider, useHookContext} from './context/HookContext.js';
import {useClaudeProcess} from './hooks/useClaudeProcess.js';
import {
	type Message as MessageType,
	type HookEventDisplay,
	type IsolationPreset,
	generateId,
} from './types/index.js';
import {parseInput} from './commands/parser.js';
import {executeCommand} from './commands/executor.js';
import {registerBuiltins} from './commands/builtins/index.js';

// Register built-in commands once at module load
registerBuiltins();

type Props = {
	projectDir: string;
	instanceId: number;
	isolation?: IsolationPreset;
	debug?: boolean;
	version: string;
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
	onClear,
}: {
	projectDir: string;
	instanceId: number;
	isolation?: IsolationPreset;
	debug?: boolean;
	version: string;
	onClear: () => void;
}) {
	const [inputKey, setInputKey] = useState(0);
	const [messages, setMessages] = useState<MessageType[]>([]);
	const messagesRef = useRef(messages);
	messagesRef.current = messages;
	const hookServer = useHookContext();
	const {events, isServerRunning, socketPath, currentSessionId} = hookServer;
	const {spawn: spawnClaude, isRunning: isClaudeRunning} = useClaudeProcess(
		projectDir,
		instanceId,
		isolation,
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
					spawn: (prompt, sessionId) => spawnClaude(prompt, sessionId),
					currentSessionId: currentSessionId ?? undefined,
				},
			});
		},
		[addMessage, spawnClaude, currentSessionId, hookServer, exit, clearScreen],
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

	// Interleave messages and hook events by timestamp
	const hookItems: ContentItem[] = debug
		? events.map(e => ({type: 'hook' as const, data: e}))
		: [];

	const contentItems: ContentItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...hookItems,
		...sessionEndMessages,
	].sort((a, b) => {
		const timeA =
			a.type === 'message'
				? Number.parseInt(a.data.id.split('-')[0] ?? '0', 10)
				: a.data.timestamp.getTime();
		const timeB =
			b.type === 'message'
				? Number.parseInt(b.data.id.split('-')[0] ?? '0', 10)
				: b.data.timestamp.getTime();
		return timeA - timeB;
	});

	// Separate stable items (for Static) from items that may update (rendered dynamically)
	// SessionEnd events need to update when transcript loads, so keep them dynamic
	const isStableContent = (item: ContentItem): boolean => {
		if (item.type === 'message') return true;
		if (item.data.hookName === 'SessionEnd') {
			return item.data.transcriptSummary !== undefined;
		}
		return item.data.status !== 'pending';
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
						<HookEvent key={item.data.id} event={item.data} />
					);
				}}
			</Static>

			{/* Dynamic items - can re-render when state changes */}
			{dynamicItems.map(item => {
				if (item.type === 'message') {
					return <Message key={item.data.id} message={item.data} />;
				}
				if (item.type === 'hook') {
					return <HookEvent key={item.data.id} event={item.data} />;
				}
				return null;
			})}

			{isClaudeRunning && (
				<Box>
					<Spinner label="Agent is thinking..." />
				</Box>
			)}

			<CommandInput inputKey={inputKey} onSubmit={handleSubmit} />
		</Box>
	);
}

export default function App({
	projectDir,
	instanceId,
	isolation,
	debug,
	version,
}: Props) {
	const [clearCount, setClearCount] = useState(0);

	return (
		<HookProvider projectDir={projectDir} instanceId={instanceId}>
			<AppContent
				key={clearCount}
				projectDir={projectDir}
				instanceId={instanceId}
				isolation={isolation}
				debug={debug}
				version={version}
				onClear={() => setClearCount(c => c + 1)}
			/>
		</HookProvider>
	);
}
