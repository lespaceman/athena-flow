import type {RuntimeEvent} from '../../../core/runtime/types';

type InteractionHints = RuntimeEvent['interaction'];

const DEFAULT_TIMEOUT_MS = 4000;
const PERMISSION_TIMEOUT_MS = 300_000;

const RULES: Record<string, InteractionHints> = {
	PermissionRequest: {
		expectsDecision: true,
		defaultTimeoutMs: PERMISSION_TIMEOUT_MS,
		canBlock: true,
	},
	PreToolUse: {
		expectsDecision: true,
		defaultTimeoutMs: PERMISSION_TIMEOUT_MS,
		canBlock: true,
	},
	PostToolUse: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	PostToolUseFailure: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	Stop: {
		expectsDecision: true,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	SubagentStop: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	SubagentStart: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	Notification: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	SessionStart: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	SessionEnd: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	PreCompact: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	UserPromptSubmit: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	Setup: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: false,
	},
	TeammateIdle: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	TaskCompleted: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
	ConfigChange: {
		expectsDecision: false,
		defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		canBlock: true,
	},
};

const DEFAULT_HINTS: InteractionHints = {
	expectsDecision: false,
	defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
	canBlock: false,
};

export function getInteractionHints(hookName: string): InteractionHints {
	return RULES[hookName] ?? DEFAULT_HINTS;
}
