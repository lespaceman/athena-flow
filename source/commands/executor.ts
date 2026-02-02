/**
 * Command executor.
 *
 * Routes a parsed command to the appropriate handler based on its category.
 */

import {type Command, type ExecuteCommandContext} from './types.js';

/**
 * Execute a command by routing to the handler matching its category.
 */
export function executeCommand(
	command: Command,
	args: Record<string, string>,
	ctx: ExecuteCommandContext,
): void {
	switch (command.category) {
		case 'ui':
			command.execute({...ctx.ui, args});
			break;
		case 'prompt': {
			const prompt = command.buildPrompt(args);
			const sessionId =
				command.session === 'resume' ? ctx.prompt.currentSessionId : undefined;
			ctx.prompt.spawn(prompt, sessionId, command.isolation);
			break;
		}
		case 'hook':
			command.execute({...ctx.hook, args});
			break;
	}
}
