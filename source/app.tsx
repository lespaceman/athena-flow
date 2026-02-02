import React, {useState, useCallback, useRef} from 'react';
import {Box, Static, Text, useApp} from 'ink';
import Message from './components/Message.js';
import CommandInput from './components/CommandInput.js';
import HookEvent from './components/HookEvent.js';
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
};

type DisplayItem =
	| {type: 'message'; data: MessageType}
	| {type: 'hook'; data: HookEventDisplay};

function AppContent({
	projectDir,
	instanceId,
	isolation,
}: {
	projectDir: string;
	instanceId: number;
	isolation?: IsolationPreset;
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
		[addMessage, spawnClaude, currentSessionId, hookServer, exit],
	);

	// Interleave messages and hook events by timestamp
	const displayItems: DisplayItem[] = [
		...messages.map(m => ({type: 'message' as const, data: m})),
		...events.map(e => ({type: 'hook' as const, data: e})),
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
	const isStableItem = (item: DisplayItem): boolean => {
		if (item.type === 'message') return true;
		// Hook events are stable if they're not SessionEnd or if transcript is loaded
		if (item.data.hookName === 'SessionEnd') {
			return item.data.transcriptSummary !== undefined;
		}
		return item.data.status !== 'pending';
	};

	const stableItems = displayItems.filter(isStableItem);
	const dynamicItems = displayItems.filter(item => !isStableItem(item));

	return (
		<Box flexDirection="column">
			{/* Server status */}
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

			{/* Stable items - rendered once, never update */}
			<Static items={stableItems}>
				{item =>
					item.type === 'message' ? (
						<Message key={item.data.id} message={item.data} />
					) : (
						<HookEvent key={item.data.id} event={item.data} />
					)
				}
			</Static>

			{/* Dynamic items - can re-render when state changes */}
			{dynamicItems.map(item =>
				item.type === 'message' ? (
					<Message key={item.data.id} message={item.data} />
				) : (
					<HookEvent key={item.data.id} event={item.data} />
				),
			)}

			<CommandInput inputKey={inputKey} onSubmit={handleSubmit} />
		</Box>
	);
}

export default function App({projectDir, instanceId, isolation}: Props) {
	return (
		<HookProvider projectDir={projectDir} instanceId={instanceId}>
			<AppContent
				projectDir={projectDir}
				instanceId={instanceId}
				isolation={isolation}
			/>
		</HookProvider>
	);
}
