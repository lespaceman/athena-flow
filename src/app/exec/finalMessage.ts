import type {FeedEvent} from '../../core/feed/types';

type StreamMessageRecord = Record<string, unknown>;

function asRecord(value: unknown): StreamMessageRecord | null {
	if (typeof value === 'object' && value !== null) {
		return value as StreamMessageRecord;
	}
	return null;
}

function readAssistantText(message: StreamMessageRecord): string | null {
	if (message['role'] !== 'assistant') return null;

	const content = message['content'];
	if (!Array.isArray(content)) return null;

	const parts: string[] = [];
	for (const block of content) {
		const rec = asRecord(block);
		if (!rec || rec['type'] !== 'text') continue;
		const text = rec['text'];
		if (typeof text === 'string' && text.length > 0) {
			parts.push(text);
		}
	}

	if (parts.length === 0) return null;
	return parts.join('');
}

function extractAssistantMessage(line: string): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}

	const record = asRecord(parsed);
	if (!record) return null;

	if (record['parent_tool_use_id'] != null) {
		return null;
	}

	if (record['type'] === 'assistant') {
		const inner = asRecord(record['message']);
		if (!inner) return null;
		return readAssistantText(inner);
	}

	if (record['type'] === 'message') {
		return readAssistantText(record);
	}

	return null;
}

export function createAssistantMessageAccumulator() {
	let buffer = '';
	let lastMessage: string | null = null;

	function processLine(line: string): void {
		const text = extractAssistantMessage(line.trim());
		if (text && text.trim().length > 0) {
			lastMessage = text;
		}
	}

	return {
		feed(chunk: string): void {
			buffer += chunk;
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				processLine(line);
			}
		},
		flush(): void {
			if (!buffer.trim()) return;
			processLine(buffer);
			buffer = '';
		},
		getLastMessage(): string | null {
			return lastMessage;
		},
		reset(): void {
			buffer = '';
			lastMessage = null;
		},
	};
}

export function findLastMappedAgentMessage(
	feedEvents: FeedEvent[],
): string | null {
	for (let i = feedEvents.length - 1; i >= 0; i--) {
		const event = feedEvents[i];
		if (event.kind !== 'agent.message') continue;
		const message = event.data.message;
		if (typeof message === 'string' && message.trim().length > 0) {
			return message;
		}
	}
	return null;
}

export function resolveFinalMessage(input: {
	streamMessage: string | null;
	mappedMessage: string | null;
}): {
	message: string;
	source: 'stream' | 'mapped' | 'empty';
} {
	if (input.streamMessage && input.streamMessage.trim().length > 0) {
		return {message: input.streamMessage, source: 'stream'};
	}

	if (input.mappedMessage && input.mappedMessage.trim().length > 0) {
		return {message: input.mappedMessage, source: 'mapped'};
	}

	return {message: '', source: 'empty'};
}
