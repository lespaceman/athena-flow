import {describe, it, expect, vi, beforeEach} from 'vitest';
import * as fs from 'node:fs';
import {loadHistory, saveHistory} from './historyStore';

vi.mock('node:fs');

const mockedFs = vi.mocked(fs);

beforeEach(() => {
	vi.clearAllMocks();
});

describe('loadHistory', () => {
	it('returns empty array when file does not exist', () => {
		mockedFs.readFileSync.mockImplementation(() => {
			throw new Error('ENOENT');
		});

		expect(loadHistory('/project')).toEqual([]);
	});

	it('returns parsed array from valid JSON', () => {
		mockedFs.readFileSync.mockReturnValue(
			JSON.stringify(['hello', 'world']) + '\n',
		);

		expect(loadHistory('/project')).toEqual(['hello', 'world']);
	});

	it('returns empty array for corrupt JSON', () => {
		mockedFs.readFileSync.mockReturnValue('not valid json{{{');

		expect(loadHistory('/project')).toEqual([]);
	});

	it('returns empty array when JSON is not an array', () => {
		mockedFs.readFileSync.mockReturnValue(JSON.stringify({key: 'value'}));

		expect(loadHistory('/project')).toEqual([]);
	});

	it('filters out non-string entries', () => {
		mockedFs.readFileSync.mockReturnValue(
			JSON.stringify(['valid', 42, null, 'also-valid', true]),
		);

		expect(loadHistory('/project')).toEqual(['valid', 'also-valid']);
	});

	it('reads from correct path', () => {
		mockedFs.readFileSync.mockReturnValue('[]');

		loadHistory('/my/project');

		expect(mockedFs.readFileSync).toHaveBeenCalledWith(
			'/my/project/.claude/input-history.json',
			'utf-8',
		);
	});
});

describe('saveHistory', () => {
	it('creates directory, writes to tmp, and renames atomically', async () => {
		await saveHistory('/project', ['one', 'two']);

		expect(mockedFs.promises.mkdir).toHaveBeenCalledWith('/project/.claude', {
			recursive: true,
		});
		expect(mockedFs.promises.writeFile).toHaveBeenCalledWith(
			'/project/.claude/input-history.json.tmp',
			JSON.stringify(['one', 'two']) + '\n',
		);
		expect(mockedFs.promises.rename).toHaveBeenCalledWith(
			'/project/.claude/input-history.json.tmp',
			'/project/.claude/input-history.json',
		);
	});

	it('silently handles mkdir errors', async () => {
		mockedFs.promises.mkdir.mockRejectedValue(new Error('EPERM'));

		await expect(saveHistory('/project', ['test'])).resolves.toBeUndefined();
	});

	it('silently handles write errors', async () => {
		mockedFs.promises.writeFile.mockRejectedValue(new Error('EACCES'));

		await expect(saveHistory('/project', ['test'])).resolves.toBeUndefined();
	});

	it('silently handles rename errors', async () => {
		mockedFs.promises.rename.mockRejectedValue(new Error('EXDEV'));

		await expect(saveHistory('/project', ['test'])).resolves.toBeUndefined();
	});
});
