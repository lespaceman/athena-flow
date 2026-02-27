/**
 * Command registry.
 *
 * A simple Map-backed registry that stores commands by name and aliases.
 * Duplicate names / aliases throw at registration time so conflicts are
 * caught early.
 */

import {type Command} from './types';

const commands = new Map<string, Command>();

/**
 * Register a command by its name and optional aliases.
 * Throws if any name or alias is already registered.
 */
export function register(command: Command): void {
	const names = [command.name, ...(command.aliases ?? [])];

	for (const name of names) {
		if (commands.has(name)) {
			throw new Error(`Command name or alias "${name}" is already registered`);
		}
	}

	for (const name of names) {
		commands.set(name, command);
	}
}

/**
 * Retrieve a command by its name or alias. Returns undefined if not found.
 */
export function get(name: string): Command | undefined {
	return commands.get(name);
}

/**
 * Return all unique commands (no duplicate entries for aliases).
 */
export function getAll(): Command[] {
	const seen = new Set<string>();
	const result: Command[] = [];

	for (const command of commands.values()) {
		if (!seen.has(command.name)) {
			seen.add(command.name);
			result.push(command);
		}
	}

	return result;
}

/**
 * Remove all registered commands. Mainly useful for tests.
 */
export function clear(): void {
	commands.clear();
}
