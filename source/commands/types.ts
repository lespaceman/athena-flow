/**
 * Command system types.
 *
 * Defines the command type hierarchy using discriminated unions on the
 * `category` field. Each category has its own execution interface.
 */

import {type Message} from '../types/common.js';
import {type IsolationConfig} from '../types/isolation.js';
import {type UseFeedResult} from '../hooks/useFeed.js';
import {type SessionStatsSnapshot} from '../types/headerMetrics.js';

// ---------------------------------------------------------------------------
// Core command types
// ---------------------------------------------------------------------------

export type CommandCategory = 'ui' | 'prompt' | 'hook';
export type SessionStrategy = 'new' | 'resume';

export type CommandArg = {
	name: string;
	description: string;
	required: boolean;
};

type CommandBase = {
	name: string;
	description: string;
	category: CommandCategory;
	aliases?: string[];
	args?: CommandArg[];
};

export type UICommand = CommandBase & {
	category: 'ui';
	execute: (ctx: UICommandContext) => void;
};

export type PromptCommand = CommandBase & {
	category: 'prompt';
	session: SessionStrategy;
	isolation?: Partial<IsolationConfig>;
	buildPrompt: (args: Record<string, string>) => string;
};

export type HookCommand = CommandBase & {
	category: 'hook';
	execute: (ctx: HookCommandContext) => void;
};

export type Command = UICommand | PromptCommand | HookCommand;

// ---------------------------------------------------------------------------
// Execution contexts
// ---------------------------------------------------------------------------

export type UICommandContext = {
	args: Record<string, string>;
	messages: Message[];
	setMessages: (msgs: Message[]) => void;
	addMessage: (msg: Message) => void;
	exit: () => void;
	clearScreen: () => void;
	showSessions: () => void;
	sessionStats: SessionStatsSnapshot;
};

export type HookCommandContext = {
	args: Record<string, string>;
	feed: UseFeedResult;
};

export type PromptCommandContext = {
	spawn: (
		prompt: string,
		sessionId?: string,
		isolation?: Partial<IsolationConfig>,
	) => void;
	currentSessionId: string | undefined;
};

export type ExecuteCommandContext = {
	ui: UICommandContext;
	hook: HookCommandContext;
	prompt: PromptCommandContext;
};
