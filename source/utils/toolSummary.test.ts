import {describe, it, expect} from 'vitest';
import {summarizeToolResult} from './toolSummary.js';

describe('summarizeToolResult', () => {
	it('summarizes Bash success with exit 0', () => {
		const result = summarizeToolResult(
			'Bash',
			{command: 'ls'},
			{
				stdout: 'file1\nfile2\n',
				stderr: '',
				exitCode: 0,
			},
		);
		expect(result).toBe('exit 0');
	});

	it('summarizes Bash failure with exit code and first stderr line', () => {
		const result = summarizeToolResult(
			'Bash',
			{command: 'bad-cmd'},
			{
				stdout: '',
				stderr: 'command not found: bad-cmd\nsome other line',
				exitCode: 127,
			},
		);
		expect(result).toBe('exit 127 — command not found: bad-cmd');
	});

	it('summarizes Read with line count', () => {
		const result = summarizeToolResult('Read', {file_path: '/tmp/f.ts'}, [
			{type: 'text', file: {content: 'line1\nline2\nline3'}},
		]);
		expect(result).toBe('3 lines');
	});

	it('summarizes Edit with line count', () => {
		const result = summarizeToolResult(
			'Edit',
			{
				file_path: 'src/app.tsx',
				old_string: 'foo\nbar',
				new_string: 'baz\nqux\nquux',
			},
			{filePath: 'src/app.tsx', success: true},
		);
		expect(result).toBe('replaced 2 → 3 lines');
	});

	it('Write returns empty — path is already in primary input', () => {
		const result = summarizeToolResult(
			'Write',
			{file_path: '/tmp/output.txt', content: 'hello'},
			{filePath: '/tmp/output.txt', success: true},
		);
		expect(result).toBe('');
	});

	it('summarizes Glob with file count', () => {
		const result = summarizeToolResult(
			'Glob',
			{pattern: '**/*.ts'},
			{
				filenames: ['a.ts', 'b.ts', 'c.ts'],
				numFiles: 3,
			},
		);
		expect(result).toBe('3 files');
	});

	it('summarizes Glob with singular file', () => {
		expect(
			summarizeToolResult('Glob', {pattern: '*.ts'}, {filenames: ['a.ts']}),
		).toBe('1 file');
		expect(summarizeToolResult('Glob', {pattern: '*.ts'}, {numFiles: 1})).toBe(
			'1 file',
		);
	});

	it('summarizes Grep with match count', () => {
		const result = summarizeToolResult(
			'Grep',
			{pattern: 'foo'},
			'a.ts:1:foo\nb.ts:5:foo bar',
		);
		expect(result).toBe('2 matches');
	});

	it('summarizes WebSearch with result count', () => {
		const result = summarizeToolResult(
			'WebSearch',
			{query: 'test'},
			{
				results: [{content: [{title: 'A'}, {title: 'B'}]}],
			},
		);
		expect(result).toBe('2 results');
	});

	it('summarizes Task with agent type only', () => {
		const result = summarizeToolResult(
			'Task',
			{
				subagent_type: 'Explore',
				description: 'Find files',
			},
			{status: 'completed', content: [{type: 'text', text: 'done'}]},
		);
		expect(result).toBe('Explore');
	});

	it('returns empty string for unknown tools', () => {
		const result = summarizeToolResult('CustomTool', {}, 'some result');
		expect(result).toBe('');
	});

	it('returns empty string for unknown MCP tools', () => {
		expect(summarizeToolResult('mcp__x__navigate', {}, {})).toBe('');
	});

	it('returns empty string for Read when no content extracted', () => {
		expect(summarizeToolResult('Read', {}, null)).toBe('');
	});

	it('returns empty string for Glob when no filenames or numFiles', () => {
		expect(summarizeToolResult('Glob', {}, {})).toBe('');
	});

	it('returns empty string for WebSearch when no results', () => {
		expect(summarizeToolResult('WebSearch', {}, {})).toBe('');
	});

	it('returns empty string for Grep when response is not a string', () => {
		expect(summarizeToolResult('Grep', {pattern: 'foo'}, null)).toBe('');
		expect(summarizeToolResult('Grep', {pattern: 'foo'}, {})).toBe('');
	});

	it('summarizes failure with error string', () => {
		const result = summarizeToolResult(
			'Bash',
			{command: 'x'},
			undefined,
			'command not found',
		);
		expect(result).toBe('command not found');
	});
});
