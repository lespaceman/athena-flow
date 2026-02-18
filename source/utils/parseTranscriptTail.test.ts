import {describe, it, expect, vi, beforeEach} from 'vitest';
import * as fs from 'node:fs/promises';
import {parseTranscriptTail} from './parseTranscriptTail.js';

vi.mock('node:fs/promises');

const mockedFs = vi.mocked(fs);

describe('parseTranscriptTail', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('extracts last assistant message from JSONL', async () => {
		const lines = [
			JSON.stringify({type: 'user', message: {content: 'hello'}}),
			JSON.stringify({
				type: 'assistant',
				message: {content: [{type: 'text', text: 'First response'}]},
			}),
			JSON.stringify({
				type: 'assistant',
				message: {content: [{type: 'text', text: 'Final response here'}]},
			}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(lines);

		const result = await parseTranscriptTail('/tmp/transcript.jsonl');
		expect(result).toBe('Final response here');
	});

	it('returns null when no assistant messages found', async () => {
		const lines = [
			JSON.stringify({type: 'user', message: {content: 'hello'}}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(lines);

		const result = await parseTranscriptTail('/tmp/transcript.jsonl');
		expect(result).toBeNull();
	});

	it('returns null on file read error', async () => {
		mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));

		const result = await parseTranscriptTail('/tmp/missing.jsonl');
		expect(result).toBeNull();
	});

	it('handles string content in assistant messages', async () => {
		const lines = [
			JSON.stringify({
				type: 'assistant',
				message: {content: 'Plain string response'},
			}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(lines);

		const result = await parseTranscriptTail('/tmp/transcript.jsonl');
		expect(result).toBe('Plain string response');
	});

	it('skips assistant messages with only tool_use content', async () => {
		const lines = [
			JSON.stringify({
				type: 'assistant',
				message: {content: [{type: 'text', text: 'Real message'}]},
			}),
			JSON.stringify({
				type: 'assistant',
				message: {content: [{type: 'tool_use', id: 't1', name: 'Bash'}]},
			}),
		].join('\n');

		mockedFs.readFile.mockResolvedValue(lines);

		const result = await parseTranscriptTail('/tmp/transcript.jsonl');
		expect(result).toBe('Real message');
	});

	it('respects abort signal', async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await parseTranscriptTail('/tmp/t.jsonl', controller.signal);
		expect(result).toBeNull();
	});
});
