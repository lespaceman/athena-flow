import {describe, it, expect, vi, beforeEach} from 'vitest';

const files: Record<string, string> = {};

vi.mock('node:fs', () => ({
	default: {
		existsSync: (p: string) => p in files,
		readFileSync: (p: string) => {
			if (!(p in files)) throw new Error(`ENOENT: ${p}`);
			return files[p];
		},
	},
}));

vi.mock('node:os', () => ({
	default: {
		homedir: () => '/home/testuser',
	},
}));

// Import after mocks are set up
const {readConfig, readGlobalConfig} = await import('../config.js');

beforeEach(() => {
	for (const key of Object.keys(files)) {
		delete files[key];
	}
});

describe('readConfig', () => {
	it('returns empty plugins when config file does not exist', () => {
		expect(readConfig('/project')).toEqual({plugins: []});
	});

	it('reads plugins from .athena/config.json', () => {
		files['/project/.athena/config.json'] = JSON.stringify({
			plugins: ['/absolute/plugin'],
		});

		expect(readConfig('/project')).toEqual({
			plugins: ['/absolute/plugin'],
		});
	});

	it('resolves relative paths against projectDir', () => {
		files['/project/.athena/config.json'] = JSON.stringify({
			plugins: ['relative/plugin'],
		});

		const result = readConfig('/project');

		expect(result.plugins).toEqual(['/project/relative/plugin']);
	});

	it('passes through absolute paths unchanged', () => {
		files['/project/.athena/config.json'] = JSON.stringify({
			plugins: ['/absolute/plugin', 'relative/one'],
		});

		const result = readConfig('/project');

		expect(result.plugins).toEqual([
			'/absolute/plugin',
			'/project/relative/one',
		]);
	});

	it('returns empty plugins when plugins key is missing', () => {
		files['/project/.athena/config.json'] = JSON.stringify({});

		expect(readConfig('/project')).toEqual({plugins: []});
	});
});

describe('readGlobalConfig', () => {
	it('returns empty plugins when global config does not exist', () => {
		expect(readGlobalConfig()).toEqual({plugins: []});
	});

	it('reads plugins from ~/.config/athena/config.json', () => {
		files['/home/testuser/.config/athena/config.json'] = JSON.stringify({
			plugins: ['/absolute/global-plugin'],
		});

		expect(readGlobalConfig()).toEqual({
			plugins: ['/absolute/global-plugin'],
		});
	});

	it('resolves relative paths against home directory', () => {
		files['/home/testuser/.config/athena/config.json'] = JSON.stringify({
			plugins: ['my-plugins/custom'],
		});

		const result = readGlobalConfig();

		expect(result.plugins).toEqual(['/home/testuser/my-plugins/custom']);
	});

	it('returns empty plugins when plugins key is missing', () => {
		files['/home/testuser/.config/athena/config.json'] = JSON.stringify({});

		expect(readGlobalConfig()).toEqual({plugins: []});
	});
});
