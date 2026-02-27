import {describe, it, expect, beforeEach} from 'vitest';
import {parseInput} from '../parser';
import {register, clear} from '../registry';
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

describe('parseInput', () => {
	beforeEach(() => {
		clear();
	});

	it('parses a registered command with arguments', () => {
		register(
			makePromptCommand({
				name: 'commit',
				args: [
					{name: 'message', description: 'Commit message', required: false},
				],
			}),
		);

		const result = parseInput('/commit fix the bug');
		expect(result.type).toBe('command');
		if (result.type === 'command') {
			expect(result.name).toBe('commit');
			expect(result.rawArgs).toBe('fix the bug');
			expect(result.args).toEqual({message: 'fix the bug'});
		}
	});

	it('parses a registered command without arguments', () => {
		register(makeUICommand({name: 'help'}));

		const result = parseInput('/help');
		expect(result.type).toBe('command');
		if (result.type === 'command') {
			expect(result.name).toBe('help');
			expect(result.rawArgs).toBe('');
			expect(result.args).toEqual({});
		}
	});

	it('treats unregistered /command as a plain prompt', () => {
		const result = parseInput('/unknown foo');
		expect(result.type).toBe('prompt');
		if (result.type === 'prompt') {
			expect(result.text).toBe('/unknown foo');
		}
	});

	it('treats plain text as a prompt', () => {
		const result = parseInput('hello world');
		expect(result.type).toBe('prompt');
		if (result.type === 'prompt') {
			expect(result.text).toBe('hello world');
		}
	});

	it('treats "/" alone as a prompt', () => {
		const result = parseInput('/');
		expect(result.type).toBe('prompt');
		if (result.type === 'prompt') {
			expect(result.text).toBe('/');
		}
	});

	it('resolves aliases', () => {
		register(makeUICommand({name: 'help', aliases: ['h', '?']}));

		const result = parseInput('/h');
		expect(result.type).toBe('command');
		if (result.type === 'command') {
			expect(result.name).toBe('h');
			expect(result.command.name).toBe('help');
		}
	});

	it('handles leading/trailing whitespace', () => {
		register(makeUICommand({name: 'clear'}));

		const result = parseInput('  /clear  ');
		expect(result.type).toBe('command');
		if (result.type === 'command') {
			expect(result.name).toBe('clear');
		}
	});

	it('maps multiple positional args in order', () => {
		register(
			makePromptCommand({
				name: 'test',
				args: [
					{name: 'first', description: '', required: true},
					{name: 'second', description: '', required: false},
				],
			}),
		);

		const result = parseInput('/test alpha beta gamma');
		expect(result.type).toBe('command');
		if (result.type === 'command') {
			expect(result.args).toEqual({first: 'alpha', second: 'beta gamma'});
		}
	});

	it('treats empty string as a prompt', () => {
		const result = parseInput('');
		expect(result.type).toBe('prompt');
		if (result.type === 'prompt') {
			expect(result.text).toBe('');
		}
	});
});
