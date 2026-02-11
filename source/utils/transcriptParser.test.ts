import {describe, it, expect, vi, beforeEach} from 'vitest';
import * as fs from 'node:fs/promises';
import {
	parseTranscriptFile,
	extractTextFromContent,
	countToolCalls,
	type TranscriptContent,
} from './transcriptParser.js';

vi.mock('node:fs/promises');

const mockedFs = vi.mocked(fs);

describe('extractTextFromContent', () => {
	it('returns string content as-is', () => {
		expect(extractTextFromContent('Hello world')).toBe('Hello world');
	});

	it('extracts text from content array', () => {
		const content: TranscriptContent[] = [
			{type: 'text', text: 'First part'},
			{type: 'text', text: 'Second part'},
		];
		expect(extractTextFromContent(content)).toBe('First part\nSecond part');
	});

	it('ignores non-text content items', () => {
		const content: TranscriptContent[] = [
			{type: 'text', text: 'Hello'},
			{type: 'thinking', thinking: 'internal thought'},
			{type: 'tool_use', id: '123', name: 'Read', input: {file: 'test.ts'}},
			{type: 'text', text: 'World'},
		];
		expect(extractTextFromContent(content)).toBe('Hello\nWorld');
	});

	it('returns empty string for empty array', () => {
		expect(extractTextFromContent([])).toBe('');
	});
});

describe('countToolCalls', () => {
	it('returns 0 for string content', () => {
		expect(countToolCalls('Hello world')).toBe(0);
	});

	it('counts tool_use items in content array', () => {
		const content: TranscriptContent[] = [
			{type: 'text', text: 'First'},
			{type: 'tool_use', id: '1', name: 'Read', input: {}},
			{type: 'tool_use', id: '2', name: 'Write', input: {}},
			{type: 'text', text: 'Last'},
		];
		expect(countToolCalls(content)).toBe(2);
	});

	it('returns 0 for array with no tool calls', () => {
		const content: TranscriptContent[] = [
			{type: 'text', text: 'Hello'},
			{type: 'thinking', thinking: 'thought'},
		];
		expect(countToolCalls(content)).toBe(0);
	});
});

describe('parseTranscriptFile', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('parses transcript with assistant messages', async () => {
		const transcriptContent = [
			JSON.stringify({
				type: 'user',
				message: {role: 'user', content: 'Hello'},
				timestamp: '2025-01-25T10:00:00Z',
			}),
			JSON.stringify({
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{type: 'text', text: 'Hi there!'}],
				},
				timestamp: '2025-01-25T10:00:01Z',
			}),
			JSON.stringify({
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{type: 'text', text: 'How can I help?'}],
				},
				timestamp: '2025-01-25T10:00:02Z',
			}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(transcriptContent);

		const result = await parseTranscriptFile('/path/to/transcript.jsonl');

		expect(result.lastAssistantText).toBe('How can I help?');
		expect(result.lastAssistantTimestamp?.toISOString()).toBe(
			'2025-01-25T10:00:02.000Z',
		);
		expect(result.messageCount).toBe(3); // 1 user + 2 assistant
		expect(result.toolCallCount).toBe(0);
		expect(result.error).toBeUndefined();
	});

	it('counts tool calls across all assistant messages', async () => {
		const transcriptContent = [
			JSON.stringify({
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [
						{type: 'text', text: 'Reading file...'},
						{type: 'tool_use', id: '1', name: 'Read', input: {file: 'a.ts'}},
					],
				},
				timestamp: '2025-01-25T10:00:00Z',
			}),
			JSON.stringify({
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [
						{type: 'tool_use', id: '2', name: 'Write', input: {file: 'b.ts'}},
						{type: 'tool_use', id: '3', name: 'Bash', input: {cmd: 'npm test'}},
					],
				},
				timestamp: '2025-01-25T10:00:01Z',
			}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(transcriptContent);

		const result = await parseTranscriptFile('/path/to/transcript.jsonl');

		expect(result.toolCallCount).toBe(3);
		expect(result.messageCount).toBe(2);
	});

	it('handles string content in messages', async () => {
		const transcriptContent = JSON.stringify({
			type: 'assistant',
			message: {
				role: 'assistant',
				content: 'Simple string response',
			},
			timestamp: '2025-01-25T10:00:00Z',
		});

		mockedFs.readFile.mockResolvedValue(transcriptContent);

		const result = await parseTranscriptFile('/path/to/transcript.jsonl');

		expect(result.lastAssistantText).toBe('Simple string response');
	});

	it('handles empty transcript file', async () => {
		mockedFs.readFile.mockResolvedValue('');

		const result = await parseTranscriptFile('/path/to/transcript.jsonl');

		expect(result.lastAssistantText).toBeNull();
		expect(result.messageCount).toBe(0);
		expect(result.error).toBe('No messages in session');
	});

	it('handles file not found error', async () => {
		const error = new Error('ENOENT') as NodeJS.ErrnoException;
		error.code = 'ENOENT';
		mockedFs.readFile.mockRejectedValue(error);

		const result = await parseTranscriptFile('/nonexistent/file.jsonl');

		expect(result.lastAssistantText).toBeNull();
		expect(result.error).toBe('Transcript not available');
	});

	it('handles generic read errors', async () => {
		mockedFs.readFile.mockRejectedValue(new Error('Permission denied'));

		const result = await parseTranscriptFile('/path/to/transcript.jsonl');

		expect(result.lastAssistantText).toBeNull();
		expect(result.error).toBe('Could not parse transcript: Permission denied');
	});

	it('skips malformed JSON lines', async () => {
		const transcriptContent = [
			'not valid json',
			JSON.stringify({
				type: 'assistant',
				message: {role: 'assistant', content: 'Valid message'},
				timestamp: '2025-01-25T10:00:00Z',
			}),
			'{incomplete json',
		].join('\n');

		mockedFs.readFile.mockResolvedValue(transcriptContent);

		const result = await parseTranscriptFile('/path/to/transcript.jsonl');

		expect(result.lastAssistantText).toBe('Valid message');
		expect(result.messageCount).toBe(1);
		expect(result.error).toBeUndefined();
	});

	it('handles transcript with only user messages', async () => {
		const transcriptContent = JSON.stringify({
			type: 'user',
			message: {role: 'user', content: 'Hello'},
			timestamp: '2025-01-25T10:00:00Z',
		});

		mockedFs.readFile.mockResolvedValue(transcriptContent);

		const result = await parseTranscriptFile('/path/to/transcript.jsonl');

		expect(result.lastAssistantText).toBeNull();
		expect(result.lastAssistantTimestamp).toBeNull();
		expect(result.messageCount).toBe(1);
	});

	it('handles whitespace-only lines', async () => {
		const transcriptContent = [
			'',
			'   ',
			JSON.stringify({
				type: 'assistant',
				message: {role: 'assistant', content: 'Hello'},
			}),
			'',
		].join('\n');

		mockedFs.readFile.mockResolvedValue(transcriptContent);

		const result = await parseTranscriptFile('/path/to/transcript.jsonl');

		expect(result.lastAssistantText).toBe('Hello');
		expect(result.messageCount).toBe(1);
	});

	it('returns early when signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await parseTranscriptFile('/any/path', controller.signal);
		expect(result.error).toBe('Aborted');
		expect(result.messageCount).toBe(0);
	});

	it('preserves last text when followed by tool-only messages', async () => {
		const transcriptContent = [
			JSON.stringify({
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{type: 'text', text: 'Here is my response'}],
				},
				timestamp: '2025-01-25T10:00:00Z',
			}),
			JSON.stringify({
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [
						{type: 'tool_use', id: '1', name: 'Read', input: {file: 'test.ts'}},
					],
				},
				timestamp: '2025-01-25T10:00:01Z',
			}),
			JSON.stringify({
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{type: 'thinking', thinking: 'internal thought'}],
				},
				timestamp: '2025-01-25T10:00:02Z',
			}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(transcriptContent);

		const result = await parseTranscriptFile('/path/to/transcript.jsonl');

		// Should preserve the text from the first message, not overwrite with empty
		expect(result.lastAssistantText).toBe('Here is my response');
		// Timestamp should be from the message with text, not the last message
		expect(result.lastAssistantTimestamp?.toISOString()).toBe(
			'2025-01-25T10:00:00.000Z',
		);
		expect(result.messageCount).toBe(3);
		expect(result.toolCallCount).toBe(1);
	});
});
