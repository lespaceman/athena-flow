import * as fs from 'node:fs/promises';

type TranscriptContent =
	| {type: 'text'; text: string}
	| {type: 'tool_use'; [key: string]: unknown}
	| {type: string; [key: string]: unknown};

type TranscriptEntry = {
	type: string;
	message?: {
		content: string | TranscriptContent[];
	};
	[key: string]: unknown;
};

function extractText(content: string | TranscriptContent[]): string | null {
	if (typeof content === 'string') {
		return content || null;
	}
	const texts: string[] = [];
	for (const item of content) {
		if (item.type === 'text' && typeof item.text === 'string') {
			texts.push(item.text);
		}
	}
	return texts.length > 0 ? texts.join('\n') : null;
}

/**
 * Parse a transcript JSONL file and return the last assistant text message.
 * Reads the whole file (transcripts are typically small).
 * Returns null on any error or if no assistant text is found.
 */
export async function parseTranscriptTail(
	filePath: string,
	signal?: AbortSignal,
): Promise<string | null> {
	if (signal?.aborted) return null;

	try {
		const content = await fs.readFile(filePath, {encoding: 'utf-8', signal});
		const lines = content.trim().split('\n').filter(Boolean);

		let lastText: string | null = null;

		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as TranscriptEntry;
				if (entry.type === 'assistant' && entry.message?.content) {
					const text = extractText(entry.message.content);
					if (text) {
						lastText = text;
					}
				}
			} catch {
				// Skip malformed lines
			}
		}

		return lastText;
	} catch {
		return null;
	}
}
