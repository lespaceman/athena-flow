/**
 * Built-in command registration.
 *
 * Imports all built-in commands and registers them with the registry.
 * Call `registerBuiltins()` once at startup.
 */

import {register} from '../registry.js';

import {helpCommand} from './help.js';
import {clearCommand} from './clear.js';
import {quitCommand} from './quit.js';
import {statsCommand} from './stats.js';
import {sessionsCommand} from './sessions.js';
import {contextCommand} from './context.js';
import {openCommand} from './open.js';
import {tasksCommand} from './tasks.js';

const builtins = [
	helpCommand,
	clearCommand,
	quitCommand,
	statsCommand,
	contextCommand,
	sessionsCommand,
	openCommand,
	tasksCommand,
];

let registered = false;

export function registerBuiltins(): void {
	if (registered) return;
	registered = true;

	for (const command of builtins) {
		register(command);
	}
}
