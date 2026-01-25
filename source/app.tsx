import React, {useState, useCallback} from 'react';
import {Box, Static, Text} from 'ink';
import Message from './components/Message.js';
import InputBar from './components/InputBar.js';
import HookEvent from './components/HookEvent.js';
import {HookProvider, useHookContext} from './context/HookContext.js';
import {useClaudeProcess} from './hooks/useClaudeProcess.js';
import {
	type Message as MessageType,
	type HookEventDisplay,
	generateId,
} from './types/index.js';

type Props = {
	projectDir: string;
	instanceId: number;
};

type DisplayItem =
	| {type: 'message'; data: MessageType}
	| {type: 'hook'; data: HookEventDisplay};

function AppContent({
	projectDir,
	instanceId,
}: {
	projectDir: string;
	instanceId: number;
}) {
	const [inputKey, setInputKey] = useState(0);
	const [messages, setMessages] = useState<MessageType[]>([]);
	const {events, isServerRunning, socketPath, currentSessionId} =
		useHookContext();
	const {spawn: spawnClaude, isRunning: isClaudeRunning} = useClaudeProcess(
		projectDir,
		instanceId,
	);

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

			addMessage('user', value);
			setInputKey(k => k + 1); // Reset input by changing key

			// Spawn Claude headless process - pass sessionId for resume on follow-ups
			spawnClaude(value, currentSessionId ?? undefined);
		},
		[addMessage, spawnClaude, currentSessionId],
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
				{socketPath && (
					<Text color="gray" dimColor>
						{' '}
						({socketPath})
					</Text>
				)}
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

			<InputBar inputKey={inputKey} onSubmit={handleSubmit} />
		</Box>
	);
}

export default function App({projectDir, instanceId}: Props) {
	return (
		<HookProvider projectDir={projectDir} instanceId={instanceId}>
			<AppContent projectDir={projectDir} instanceId={instanceId} />
		</HookProvider>
	);
}
