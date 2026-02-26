/**
 * Transcript parsing types.
 *
 * Types for parsing Claude Code transcript JSONL files.
 */

/**
 * Text content in a transcript message.
 */
export type TranscriptTextContent = {
	type: 'text';
	text: string;
};

/**
 * Thinking content in a transcript message.
 */
export type TranscriptThinkingContent = {
	type: 'thinking';
	thinking: string;
};

/**
 * Tool use content in a transcript message.
 */
export type TranscriptToolUseContent = {
	type: 'tool_use';
	id: string;
	name: string;
	input: Record<string, unknown>;
};

/**
 * Union of all transcript content types.
 */
export type TranscriptContent =
	| TranscriptTextContent
	| TranscriptThinkingContent
	| TranscriptToolUseContent;

/**
 * A single entry in the transcript JSONL file.
 */
export type TranscriptEntry = {
	type: 'user' | 'assistant' | 'tool_result' | string;
	message?: {
		role: string;
		content: string | TranscriptContent[];
	};
	timestamp?: string;
};

/**
 * Summary of a parsed transcript.
 */
export type ParsedTranscriptSummary = {
	lastAssistantText: string | null;
	lastAssistantTimestamp: Date | null;
	messageCount: number;
	toolCallCount: number;
	error?: string;
};
