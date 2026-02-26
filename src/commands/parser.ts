/**
 * Input parser.
 *
 * Determines whether user input is a slash command or a plain prompt.
 * Commands are resolved against the registry so that unregistered
 * `/something` inputs fall through as regular prompts.
 */

import * as registry from './registry.js';
import {type Command} from './types.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ParsedCommand = {
	type: 'command';
	name: string;
	rawArgs: string;
	args: Record<string, string>;
	command: Command;
};

export type ParsedPrompt = {
	type: 'prompt';
	text: string;
};

export type ParseResult = ParsedCommand | ParsedPrompt;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse user input into either a command invocation or a plain prompt.
 *
 * A string is treated as a command when it starts with `/` followed by a
 * name (or alias) that exists in the registry. Otherwise it is a prompt.
 */
export function parseInput(input: string): ParseResult {
	const trimmed = input.trim();

	if (!trimmed.startsWith('/') || trimmed === '/') {
		return {type: 'prompt', text: trimmed};
	}

	// Split into command name and the rest
	const spaceIndex = trimmed.indexOf(' ', 1);
	const name =
		spaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIndex);
	const rawArgs = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1);

	const command = registry.get(name);

	if (!command) {
		return {type: 'prompt', text: trimmed};
	}

	// Map positional raw tokens to the command's declared args
	const args: Record<string, string> = {};
	if (command.args && rawArgs) {
		const tokens = splitArgs(rawArgs, command.args.length);
		for (let i = 0; i < command.args.length && i < tokens.length; i++) {
			args[command.args[i]!.name] = tokens[i]!;
		}
	}

	return {type: 'command', name, rawArgs, args, command};
}

/**
 * Split a raw arg string into up to `max` tokens. The last token captures
 * everything remaining so that multi-word arguments work naturally.
 */
function splitArgs(raw: string, max: number): string[] {
	const tokens: string[] = [];
	let rest = raw.trim();

	for (let i = 0; i < max - 1 && rest.length > 0; i++) {
		const spaceIdx = rest.indexOf(' ');
		if (spaceIdx === -1) {
			tokens.push(rest);
			rest = '';
			break;
		}
		tokens.push(rest.slice(0, spaceIdx));
		rest = rest.slice(spaceIdx + 1).trimStart();
	}

	if (rest.length > 0) {
		tokens.push(rest);
	}

	return tokens;
}
