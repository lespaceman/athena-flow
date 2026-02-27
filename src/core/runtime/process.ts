import type {TokenUsage} from '../../shared/types/headerMetrics';

/**
 * Harness-agnostic process lifecycle contract for prompt execution.
 */
export type HarnessProcess<ConfigOverride = unknown> = {
	isRunning: boolean;
	spawn: (
		prompt: string,
		sessionId?: string,
		configOverride?: ConfigOverride,
	) => Promise<void>;
	interrupt: () => void;
	kill: () => Promise<void>;
	usage: TokenUsage;
};

/**
 * Strategy contract for parsing token usage from harness stdout streams.
 */
export type TokenUsageParser = {
	feed: (chunk: string) => void;
	flush: () => void;
	getUsage: () => TokenUsage;
	reset: () => void;
};

/**
 * Factory for creating parser instances per process hook lifecycle.
 */
export type TokenUsageParserFactory = () => TokenUsageParser;
