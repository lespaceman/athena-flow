import type {TokenUsage} from '../types/headerMetrics.js';

/**
 * Token usage fields in the Claude stream-json `usage` object.
 *
 * Each `{type: "message"}` object carries per-turn usage.
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
	[key: string]: unknown;
};

/**
 * Creates a stateful NDJSON parser that accumulates token usage
 * from Claude's `--output-format stream-json` stdout.
 *
 * Handles partial lines across chunk boundaries (line buffering).
 * Extracts usage from `{type: "message"}` and `{type: "result"}` objects.
 */
export function createTokenAccumulator() {
	let buffer = '';
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheRead = 0;
	let cacheWrite = 0;

	function processLine(line: string): void {
		const trimmed = line.trim();
		if (!trimmed) return;

		let parsed: StreamMessage;
		try {
			parsed = JSON.parse(trimmed) as StreamMessage;
		} catch {
			return; // Not valid JSON — skip
		}

		// Accept usage from complete messages (per-turn) and result (cumulative)
		if (
			(parsed.type === 'message' || parsed.type === 'result') &&
			parsed.usage
		) {
			const u = parsed.usage;
			// For "result", the usage is cumulative — replace instead of adding.
			// For "message", accumulate across turns.
			if (parsed.type === 'result') {
				inputTokens = u.input_tokens ?? inputTokens;
				outputTokens = u.output_tokens ?? outputTokens;
				cacheRead = u.cache_read_input_tokens ?? cacheRead;
				cacheWrite = u.cache_creation_input_tokens ?? cacheWrite;
			} else {
				inputTokens += u.input_tokens ?? 0;
				outputTokens += u.output_tokens ?? 0;
				cacheRead += u.cache_read_input_tokens ?? 0;
				cacheWrite += u.cache_creation_input_tokens ?? 0;
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
					contextPercent: null,
				};
			}
			return {
				input: inputTokens,
				output: outputTokens,
				cacheRead,
				cacheWrite,
				total,
				contextPercent: null, // Not available from stream-json
			};
		},

		/** Reset all accumulated state (call when starting a new process). */
		reset(): void {
			buffer = '';
			inputTokens = 0;
			outputTokens = 0;
			cacheRead = 0;
			cacheWrite = 0;
		},
	};
}
