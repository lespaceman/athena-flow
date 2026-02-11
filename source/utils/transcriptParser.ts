import * as fs from 'node:fs/promises';
import {
	type TranscriptContent,
	type TranscriptEntry,
	type ParsedTranscriptSummary,
} from '../types/transcript.js';

// Re-export types for backwards compatibility
export type {TranscriptContent, TranscriptEntry, ParsedTranscriptSummary};

/**
 * Extract text content from a message content array
 */
export function extractTextFromContent(
	content: string | TranscriptContent[],
): string {
	if (typeof content === 'string') {
		return content;
	}

	const textParts: string[] = [];
	for (const item of content) {
		if (item.type === 'text') {
			textParts.push(item.text);
		}
	}
	return textParts.join('\n');
}

/**
 * Count tool calls in a message content array
 */
export function countToolCalls(content: string | TranscriptContent[]): number {
	if (typeof content === 'string') {
		return 0;
	}

	return content.filter(item => item.type === 'tool_use').length;
}

/**
 * Parse a transcript JSONL file and return a summary
 */
export async function parseTranscriptFile(
	filePath: string,
	signal?: AbortSignal,
): Promise<ParsedTranscriptSummary> {
	// Early abort check before I/O
	if (signal?.aborted) {
		return {
			lastAssistantText: null,
			lastAssistantTimestamp: null,
			messageCount: 0,
			toolCallCount: 0,
			error: 'Aborted',
		};
	}

	try {
		const content = await fs.readFile(filePath, {encoding: 'utf-8', signal});
		const lines = content.trim().split('\n').filter(Boolean);

		if (lines.length === 0) {
			return {
				lastAssistantText: null,
				lastAssistantTimestamp: null,
				messageCount: 0,
				toolCallCount: 0,
				error: 'No messages in session',
			};
		}

		let lastAssistantText: string | null = null;
		let lastAssistantTimestamp: Date | null = null;
		let messageCount = 0;
		let toolCallCount = 0;

		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as TranscriptEntry;

				if (entry.type === 'assistant' && entry.message?.content) {
					messageCount++;
					const text = extractTextFromContent(entry.message.content);
					// Only update lastAssistantText if this message has text content
					if (text) {
						lastAssistantText = text;
						if (entry.timestamp) {
							lastAssistantTimestamp = new Date(entry.timestamp);
						}
					}
					toolCallCount += countToolCalls(entry.message.content);
				} else if (entry.type === 'user') {
					messageCount++;
				}
			} catch {
				// Skip malformed lines
			}
		}

		return {
			lastAssistantText,
			lastAssistantTimestamp,
			messageCount,
			toolCallCount,
		};
	} catch (err) {
		// Handle abort
		if (err instanceof Error && err.name === 'AbortError') {
			return {
				lastAssistantText: null,
				lastAssistantTimestamp: null,
				messageCount: 0,
				toolCallCount: 0,
				error: 'Aborted',
			};
		}

		const errorMessage =
			err instanceof Error ? err.message : 'Unknown error reading transcript';

		// Check for specific error types
		if (
			err instanceof Error &&
			'code' in err &&
			(err as NodeJS.ErrnoException).code === 'ENOENT'
		) {
			return {
				lastAssistantText: null,
				lastAssistantTimestamp: null,
				messageCount: 0,
				toolCallCount: 0,
				error: 'Transcript not available',
			};
		}

		return {
			lastAssistantText: null,
			lastAssistantTimestamp: null,
			messageCount: 0,
			toolCallCount: 0,
			error: `Could not parse transcript: ${errorMessage}`,
		};
	}
}
