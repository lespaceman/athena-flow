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
