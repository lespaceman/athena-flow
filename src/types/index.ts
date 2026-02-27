/**
 * Types barrel export.
 *
 * Re-exports all types from a single entry point.
 */

// Common types
export {type Message} from './common';

// Hook types
export * from './hooks/index';

// Transcript types
export {
	type TranscriptTextContent,
	type TranscriptThinkingContent,
	type TranscriptToolUseContent,
	type TranscriptContent,
	type TranscriptEntry,
	type ParsedTranscriptSummary,
} from './transcript';

// Process types
export {
	type SpawnClaudeOptions,
	type UseClaudeProcessResult,
} from './process';

// Isolation types
export {
	type IsolationPreset,
	type IsolationConfig,
	ISOLATION_PRESETS,
	resolveIsolationConfig,
} from './isolation';

// Rule types
export {type RuleAction, type HookRule, matchRule} from './rules';

// Server types
export {type PermissionDecision} from './server';

// Header metrics types
export * from './headerMetrics';

// Context types
export {type HookContextValue, type HookProviderProps} from './context';

// Command types
export {
	type CommandCategory,
	type SessionStrategy,
	type CommandArg,
	type UICommand,
	type PromptCommand,
	type HookCommand,
	type Command,
	type UICommandContext,
	type HookCommandContext,
	type PromptCommandContext,
	type ExecuteCommandContext,
} from '../commands/types';
