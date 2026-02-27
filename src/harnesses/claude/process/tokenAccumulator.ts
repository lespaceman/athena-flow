import type {TokenUsage} from '../../../shared/types/headerMetrics';

/**
 * Token usage fields in the Claude stream-json `usage` object.
 *
 * Per-turn usage comes from either raw API `{type: "message"}` objects
 * or CLI envelope `{type: "assistant", message: {usage: ...}}` objects.
 * The final `{type: "result"}` carries cumulative session totals.
 */
type StreamUsage = {
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
};

type StreamMessage = {
	type: string;
	usage?: StreamUsage;
	/** CLI envelope: {type: "assistant", message: {usage: ...}} */
	message?: {type?: string; usage?: StreamUsage; [key: string]: unknown};
	/** Present when this message belongs to a subagent (Task tool) */
	parent_tool_use_id?: string;
	[key: string]: unknown;
};

/**
 * Creates a stateful NDJSON parser that accumulates token usage
 * from Claude's `--output-format stream-json` stdout.
 *
 * Handles partial lines across chunk boundaries (line buffering).
 * Extracts usage from `{type: "assistant"}`, `{type: "message"}`, and `{type: "result"}` events.
 */
export function createTokenAccumulator() {
	let buffer = '';
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let contextSize = 0; // Latest turn's prompt size

	function processLine(line: string): void {
		const trimmed = line.trim();
		if (!trimmed) return;

		let parsed: StreamMessage;
		try {
			parsed = JSON.parse(trimmed) as StreamMessage;
		} catch {
			return; // Not valid JSON — skip
		}

		// Resolve usage from one of three formats:
		// - Raw API:      {type: "message", usage: {...}}
		// - CLI envelope: {type: "assistant", message: {usage: {...}}}
		// - Result:       {type: "result", usage: {...}}
		const isAssistantEnvelope =
			parsed.type === 'assistant' && parsed.message?.usage != null;
		const isPerTurn = parsed.type === 'message' || isAssistantEnvelope;
		const isResult = parsed.type === 'result';

		const usage = isAssistantEnvelope ? parsed.message!.usage : parsed.usage;

		if ((isPerTurn || isResult) && usage) {
			// Subagent messages have parent_tool_use_id — they represent
			// nested agent context, not the root agent's context window.
			const isSubagent = parsed.parent_tool_use_id != null;

			if (isResult) {
				// Result usage is cumulative — replace instead of adding
				inputTokens = usage.input_tokens ?? inputTokens;
				outputTokens = usage.output_tokens ?? outputTokens;
				cacheRead = usage.cache_read_input_tokens ?? cacheRead;
				cacheWrite = usage.cache_creation_input_tokens ?? cacheWrite;
				// Use result to derive contextSize only if no per-turn data set it
				if (contextSize === 0) {
					contextSize =
						(usage.input_tokens ?? 0) +
						(usage.cache_read_input_tokens ?? 0) +
						(usage.cache_creation_input_tokens ?? 0);
				}
			} else {
				// Per-turn: accumulate across turns
				inputTokens += usage.input_tokens ?? 0;
				outputTokens += usage.output_tokens ?? 0;
				cacheRead += usage.cache_read_input_tokens ?? 0;
				cacheWrite += usage.cache_creation_input_tokens ?? 0;
				// Track latest turn's prompt size — only from root agent
				if (!isSubagent) {
					contextSize =
						(usage.input_tokens ?? 0) +
						(usage.cache_read_input_tokens ?? 0) +
						(usage.cache_creation_input_tokens ?? 0);
				}
			}
		}
	}

	return {
		/** Feed a raw stdout chunk. Handles partial lines across calls. */
		feed(chunk: string): void {
			buffer += chunk;
			const lines = buffer.split('\n');
			// Last element is either empty (if chunk ended with \n) or a partial line
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				processLine(line);
			}
		},

		/** Flush any remaining buffered data (call when process exits). */
		flush(): void {
			if (buffer.trim()) {
				processLine(buffer);
				buffer = '';
			}
		},

		/** Current accumulated token usage, or null fields if nothing received yet. */
		getUsage(): TokenUsage {
			const total = inputTokens + outputTokens + cacheRead + cacheWrite;
			if (total === 0) {
				return {
					input: null,
					output: null,
					cacheRead: null,
					cacheWrite: null,
					total: null,
					contextSize: null,
				};
			}
			return {
				input: inputTokens,
				output: outputTokens,
				cacheRead,
				cacheWrite,
				total,
				contextSize: contextSize > 0 ? contextSize : null,
			};
		},

		/** Reset all accumulated state (call when starting a new process). */
		reset(): void {
			buffer = '';
			inputTokens = 0;
			outputTokens = 0;
			cacheRead = 0;
			cacheWrite = 0;
			contextSize = 0;
		},
	};
}
