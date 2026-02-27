import {describe, it, expect, vi, beforeEach} from 'vitest';
import {loadPlugin} from '../loader';

// Build a minimal in-memory file system for tests
const files: Record<string, string> = {};

vi.mock('node:fs', () => ({
	default: {
		existsSync: (p: string) => p in files,
		readFileSync: (p: string) => {
			if (!(p in files)) throw new Error(`ENOENT: ${p}`);
			return files[p];
		},
		readdirSync: (dir: string) => {
			const prefix = dir.endsWith('/') ? dir : dir + '/';
			const names = new Set<string>();
			for (const key of Object.keys(files)) {
				if (key.startsWith(prefix)) {
					const rest = key.slice(prefix.length);
					const firstSegment = rest.split('/')[0]!;
					names.add(firstSegment);
				}
			}
			return [...names].map(name => ({
				name,
				isDirectory: () => {
					// It's a directory if there are deeper paths
					const full = prefix + name + '/';
					return Object.keys(files).some(k => k.startsWith(full));
				},
			}));
		},
	},
}));

const manifest = JSON.stringify({
	name: 'test-plugin',
	description: 'A test plugin',
	version: '1.0.0',
});

function addSkill(name: string, frontmatter: string, body: string) {
	files[`/plugins/test/skills/${name}/SKILL.md`] =
		`---\n${frontmatter}\n---\n${body}`;
}

beforeEach(() => {
	// Clear the virtual FS
	for (const key of Object.keys(files)) {
		delete files[key];
	}

	// Always have the plugin dir and manifest
	files['/plugins/test'] = '';
	files['/plugins/test/.claude-plugin/plugin.json'] = manifest;
	files['/plugins/test/skills'] = '';
});

describe('loadPlugin', () => {
	it('throws when plugin directory does not exist', () => {
		expect(() => loadPlugin('/nonexistent')).toThrow(
			'Plugin directory not found',
		);
	});

	it('throws when plugin.json is missing', () => {
		files['/plugins/nomanifest'] = '';
		expect(() => loadPlugin('/plugins/nomanifest')).toThrow(
			'Plugin manifest not found',
		);
	});

	it('returns empty array when skills/ dir is missing', () => {
		delete files['/plugins/test/skills'];
		expect(loadPlugin('/plugins/test')).toEqual([]);
	});

	it('loads user-invocable skills as PromptCommands', () => {
		addSkill(
			'explore',
			'name: explore\ndescription: Explore a site\nuser-invocable: true\nargument-hint: <url>',
			'Go to $ARGUMENTS',
		);

		const commands = loadPlugin('/plugins/test');

		expect(commands).toHaveLength(1);
		expect(commands[0]!.name).toBe('explore');
		expect(commands[0]!.description).toBe('Explore a site');
		expect(commands[0]!.category).toBe('prompt');
		expect(commands[0]!.session).toBe('new');
	});

	it('filters out non-invocable skills', () => {
		addSkill(
			'invocable',
			'name: invocable\ndescription: Yes\nuser-invocable: true',
			'Body',
		);
		addSkill(
			'hidden',
			'name: hidden\ndescription: No\nuser-invocable: false',
			'Body',
		);

		const commands = loadPlugin('/plugins/test');

		expect(commands).toHaveLength(1);
		expect(commands[0]!.name).toBe('invocable');
	});

	it('filters out skills without user-invocable field', () => {
		addSkill('no-field', 'name: no-field\ndescription: Missing field', 'Body');

		expect(loadPlugin('/plugins/test')).toHaveLength(0);
	});

	it('replaces $ARGUMENTS in buildPrompt with user args', () => {
		addSkill(
			'greet',
			'name: greet\ndescription: Greet\nuser-invocable: true\nargument-hint: <name>',
			'Hello $ARGUMENTS, welcome!',
		);

		const commands = loadPlugin('/plugins/test');
		const prompt = commands[0]!.buildPrompt({args: 'World'});

		expect(prompt).toBe('Hello World, welcome!');
	});

	it('replaces $ARGUMENTS with "(none provided)" when no args given', () => {
		addSkill(
			'greet',
			'name: greet\ndescription: Greet\nuser-invocable: true',
			'Args: $ARGUMENTS',
		);

		const commands = loadPlugin('/plugins/test');
		const prompt = commands[0]!.buildPrompt({});

		expect(prompt).toBe('Args: (none provided)');
	});

	it('returns body unchanged when no $ARGUMENTS placeholder', () => {
		addSkill(
			'simple',
			'name: simple\ndescription: Simple\nuser-invocable: true',
			'No arguments here.',
		);

		const commands = loadPlugin('/plugins/test');
		const prompt = commands[0]!.buildPrompt({args: 'ignored'});

		expect(prompt).toBe('No arguments here.');
	});

	it('creates args definition from argument-hint', () => {
		addSkill(
			'with-hint',
			'name: with-hint\ndescription: Has hint\nuser-invocable: true\nargument-hint: <url> <goal>',
			'Body',
		);

		const commands = loadPlugin('/plugins/test');

		expect(commands[0]!.args).toEqual([
			{name: 'args', description: '<url> <goal>', required: false},
		]);
	});

	it('has no args when argument-hint is missing', () => {
		addSkill(
			'no-hint',
			'name: no-hint\ndescription: No hint\nuser-invocable: true',
			'Body',
		);

		const commands = loadPlugin('/plugins/test');

		expect(commands[0]!.args).toBeUndefined();
	});

	it('sets isolation.mcpConfig when .mcp.json exists in plugin dir', () => {
		files['/plugins/test/.mcp.json'] = JSON.stringify({mcpServers: {}});
		addSkill(
			'browse',
			'name: browse\ndescription: Browse\nuser-invocable: true',
			'Body',
		);

		const commands = loadPlugin('/plugins/test');

		expect(commands).toHaveLength(1);
		expect(commands[0]!.isolation).toEqual({
			mcpConfig: '/plugins/test/.mcp.json',
		});
	});

	it('does not set isolation when .mcp.json is missing', () => {
		addSkill(
			'simple',
			'name: simple\ndescription: Simple\nuser-invocable: true',
			'Body',
		);

		const commands = loadPlugin('/plugins/test');

		expect(commands).toHaveLength(1);
		expect(commands[0]!.isolation).toBeUndefined();
	});
});
