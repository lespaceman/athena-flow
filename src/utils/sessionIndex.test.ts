import {describe, it, expect, vi, beforeEach} from 'vitest';
import {
	encodeProjectPath,
	readSessionIndex,
	getMostRecentSession,
} from '../infra/sessions/sessionIndex';

vi.mock('node:fs');
vi.mock('node:os', () => ({
	homedir: () => '/home/testuser',
}));

const {readFileSync} = await import('node:fs');

const mockIndex = {
	version: 1,
	entries: [
		{
			sessionId: 'aaa',
			summary: 'Older session',
			firstPrompt: 'hello',
			modified: '2026-01-01T00:00:00.000Z',
			created: '2026-01-01T00:00:00.000Z',
			gitBranch: 'main',
			messageCount: 5,
			fullPath: '/tmp/aaa.jsonl',
			fileMtime: 1000,
			projectPath: '/home/testuser/project',
			isSidechain: false,
		},
		{
			sessionId: 'bbb',
			summary: 'Newer session',
			firstPrompt: 'world',
			modified: '2026-02-01T00:00:00.000Z',
			created: '2026-02-01T00:00:00.000Z',
			gitBranch: 'feature',
			messageCount: 10,
			fullPath: '/tmp/bbb.jsonl',
			fileMtime: 2000,
			projectPath: '/home/testuser/project',
			isSidechain: false,
		},
		{
			sessionId: 'ccc',
			summary: 'Sidechain session',
			firstPrompt: 'side',
			modified: '2026-03-01T00:00:00.000Z',
			created: '2026-03-01T00:00:00.000Z',
			gitBranch: 'main',
			messageCount: 3,
			fullPath: '/tmp/ccc.jsonl',
			fileMtime: 3000,
			projectPath: '/home/testuser/project',
			isSidechain: true,
		},
	],
};

beforeEach(() => {
	vi.resetAllMocks();
});

describe('encodeProjectPath', () => {
	it('replaces slashes with dashes and strips leading dash', () => {
		expect(encodeProjectPath('/home/user/project')).toBe('home-user-project');
		expect(encodeProjectPath('/a/b/c')).toBe('a-b-c');
	});
});

describe('readSessionIndex', () => {
	it('returns entries sorted by modified descending, excluding sidechains', () => {
		vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockIndex));

		const entries = readSessionIndex('/home/testuser/project');

		expect(entries).toHaveLength(2);
		expect(entries[0]!.sessionId).toBe('bbb');
		expect(entries[1]!.sessionId).toBe('aaa');
		// Should not include internal fields
		expect(entries[0]).not.toHaveProperty('fullPath');
		expect(entries[0]).not.toHaveProperty('isSidechain');
	});

	it('returns empty array when file does not exist', () => {
		vi.mocked(readFileSync).mockImplementation(() => {
			throw new Error('ENOENT');
		});

		expect(readSessionIndex('/nonexistent')).toEqual([]);
	});

	it('returns empty array for malformed JSON', () => {
		vi.mocked(readFileSync).mockReturnValue('not json');

		expect(readSessionIndex('/whatever')).toEqual([]);
	});

	it('reads from correct path', () => {
		vi.mocked(readFileSync).mockReturnValue(
			JSON.stringify({version: 1, entries: []}),
		);

		readSessionIndex('/home/testuser/project');

		expect(readFileSync).toHaveBeenCalledWith(
			'/home/testuser/.claude/projects/home-testuser-project/sessions-index.json',
			'utf-8',
		);
	});
});

describe('getMostRecentSession', () => {
	it('returns most recent non-sidechain session', () => {
		vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockIndex));

		const session = getMostRecentSession('/home/testuser/project');
		expect(session?.sessionId).toBe('bbb');
	});

	it('returns null when no sessions exist', () => {
		vi.mocked(readFileSync).mockImplementation(() => {
			throw new Error('ENOENT');
		});

		expect(getMostRecentSession('/whatever')).toBeNull();
	});
});
