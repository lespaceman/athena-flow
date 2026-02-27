import {describe, it, expect, beforeEach} from 'vitest';
import {register, get, getAll, clear} from '../registry';
import {type UICommand, type PromptCommand} from '../types';

function makeUICommand(
	overrides: Partial<UICommand> & {name: string},
): UICommand {
	return {
		description: 'test',
		category: 'ui',
		execute: () => {},
		...overrides,
	};
}

function makePromptCommand(
	overrides: Partial<PromptCommand> & {name: string},
): PromptCommand {
	return {
		description: 'test',
		category: 'prompt',
		session: 'new',
		buildPrompt: () => '',
		...overrides,
	};
}

describe('registry', () => {
	beforeEach(() => {
		clear();
	});

	describe('register and get', () => {
		it('registers and retrieves a command by name', () => {
			const cmd = makeUICommand({name: 'help'});
			register(cmd);
			expect(get('help')).toBe(cmd);
		});

		it('registers and retrieves a command by alias', () => {
			const cmd = makeUICommand({name: 'help', aliases: ['h', '?']});
			register(cmd);
			expect(get('h')).toBe(cmd);
			expect(get('?')).toBe(cmd);
		});

		it('returns undefined for unregistered names', () => {
			expect(get('nonexistent')).toBeUndefined();
		});
	});

	describe('getAll', () => {
		it('returns all unique commands without alias duplicates', () => {
			const cmd1 = makeUICommand({name: 'help', aliases: ['h', '?']});
			const cmd2 = makePromptCommand({name: 'commit'});
			register(cmd1);
			register(cmd2);

			const all = getAll();
			expect(all).toHaveLength(2);
			expect(all).toContain(cmd1);
			expect(all).toContain(cmd2);
		});

		it('returns empty array when no commands registered', () => {
			expect(getAll()).toEqual([]);
		});
	});

	describe('duplicate detection', () => {
		it('throws when registering a duplicate name', () => {
			register(makeUICommand({name: 'help'}));
			expect(() => register(makeUICommand({name: 'help'}))).toThrow(
				'Command name or alias "help" is already registered',
			);
		});

		it('throws when an alias conflicts with an existing name', () => {
			register(makeUICommand({name: 'help'}));
			expect(() =>
				register(makeUICommand({name: 'other', aliases: ['help']})),
			).toThrow('Command name or alias "help" is already registered');
		});

		it('throws when an alias conflicts with an existing alias', () => {
			register(makeUICommand({name: 'help', aliases: ['h']}));
			expect(() =>
				register(makeUICommand({name: 'other', aliases: ['h']})),
			).toThrow('Command name or alias "h" is already registered');
		});
	});

	describe('clear', () => {
		it('removes all registered commands', () => {
			register(makeUICommand({name: 'help'}));
			clear();
			expect(get('help')).toBeUndefined();
			expect(getAll()).toEqual([]);
		});
	});
});
