import React, {useState, useCallback} from 'react';
import {Box, Static, Text} from 'ink';
import Message from './components/Message.js';
import InputBar from './components/InputBar.js';
import HookEvent from './components/HookEvent.js';
import {HookProvider, useHookContext} from './context/HookContext.js';
import {
	type Message as MessageType,
	type HookEventDisplay,
	generateId,
} from './types/index.js';

type Props = {
	name: string | undefined;
	projectDir: string;
};

type DisplayItem =
	| {type: 'message'; data: MessageType}
	| {type: 'hook'; data: HookEventDisplay};

function AppContent({name = 'Stranger'}: {name: string | undefined}) {
	const [inputKey, setInputKey] = useState(0);
	const [messages, setMessages] = useState<MessageType[]>([]);
	const {events, isServerRunning, socketPath} = useHookContext();

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

			// Simulate assistant response (replace with actual API call later)
			addMessage('assistant', `Hello ${name}! You said: "${value}"`);
		},
		[addMessage, name],
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
			</Box>

			<Static items={displayItems}>
				{item =>
					item.type === 'message' ? (
						<Message key={item.data.id} message={item.data} />
					) : (
						<HookEvent key={item.data.id} event={item.data} />
					)
				}
			</Static>

			<InputBar inputKey={inputKey} onSubmit={handleSubmit} />
		</Box>
	);
}

export default function App({name, projectDir}: Props) {
	return (
		<HookProvider projectDir={projectDir}>
			<AppContent name={name} />
		</HookProvider>
	);
}
