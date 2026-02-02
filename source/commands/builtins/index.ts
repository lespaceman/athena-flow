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

const builtins = [helpCommand, clearCommand, quitCommand];

let registered = false;

export function registerBuiltins(): void {
	if (registered) return;
	registered = true;

	for (const command of builtins) {
		register(command);
	}
}
