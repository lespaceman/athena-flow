import {describe, it, expect} from 'vitest';
import {extractToolOutput, detectLanguage} from './toolExtractors.js';

describe('detectLanguage', () => {
	it('maps common extensions to languages', () => {
		expect(detectLanguage('app.tsx')).toBe('typescript');
		expect(detectLanguage('main.py')).toBe('python');
		expect(detectLanguage('script.sh')).toBe('bash');
		expect(detectLanguage('data.json')).toBe('json');
		expect(detectLanguage('unknown')).toBeUndefined();
		expect(detectLanguage(42)).toBeUndefined();
	});
});

describe('extractToolOutput', () => {
	describe('Bash', () => {
		it('extracts stdout from structured response', () => {
			const result = extractToolOutput(
				'Bash',
				{command: 'echo hi'},
				{
					stdout: 'hello world',
					stderr: '',
					interrupted: false,
					isImage: false,
					noOutputExpected: false,
				},
			);
			expect(result).toEqual({
				type: 'code',
				content: 'hello world',
				language: 'bash',
				maxLines: 30,
			});
		});

		it('combines stdout and stderr', () => {
			const result = extractToolOutput(
				'Bash',
				{},
				{
					stdout: 'output',
					stderr: 'warning',
					interrupted: false,
					isImage: false,
					noOutputExpected: false,
				},
			);
			expect(result.type).toBe('code');
			if (result.type === 'code') {
				expect(result.content).toBe('output\nwarning');
			}
		});
	});

	describe('Read', () => {
		it('extracts content from PostToolUse content-block array', () => {
			// Actual PostToolUse shape: [{type:"text", file:{filePath, content, numLines, ...}}]
			const result = extractToolOutput('Read', {file_path: 'src/app.tsx'}, [
				{
					type: 'text',
					file: {
						filePath: '/home/user/src/app.tsx',
						content: 'const x = 1;',
						numLines: 1,
						startLine: 1,
						totalLines: 50,
					},
				},
			]);
			expect(result).toEqual({
				type: 'code',
				content: 'const x = 1;',
				language: 'typescript',
				maxLines: 20,
			});
		});

		it('extracts content from single object with file field', () => {
			const result = extractToolOutput(
				'Read',
				{file_path: 'main.py'},
				{
					type: 'text',
					file: {
						filePath: '/home/user/main.py',
						content: 'print("hi")',
						numLines: 1,
						startLine: 1,
						totalLines: 10,
					},
				},
			);
			expect(result).toEqual({
				type: 'code',
				content: 'print("hi")',
				language: 'python',
				maxLines: 20,
			});
		});

		it('falls back to string response', () => {
			const result = extractToolOutput(
				'Read',
				{file_path: 'src/app.tsx'},
				'const x = 1;',
			);
			expect(result).toEqual({
				type: 'code',
				content: 'const x = 1;',
				language: 'typescript',
				maxLines: 20,
			});
		});
	});

	describe('Edit', () => {
		it('returns diff with old and new text from tool_input', () => {
			const result = extractToolOutput(
				'Edit',
				{
					file_path: 'foo.ts',
					old_string: 'const a = 1;',
					new_string: 'const a = 2;',
				},
				'File updated',
			);
			expect(result).toEqual({
				type: 'diff',
				oldText: 'const a = 1;',
				newText: 'const a = 2;',
			});
		});
	});

	describe('Write', () => {
		it('shows confirmation from PostToolUse structured response', () => {
			const result = extractToolOutput(
				'Write',
				{file_path: '/tmp/test.txt'},
				{filePath: '/tmp/test.txt', success: true},
			);
			expect(result).toEqual({
				type: 'text',
				content: 'Wrote /tmp/test.txt',
			});
		});

		it('handles string response', () => {
			const result = extractToolOutput(
				'Write',
				{file_path: '/tmp/test.txt'},
				'File created successfully',
			);
			expect(result).toEqual({
				type: 'text',
				content: 'File created successfully',
			});
		});
	});

	describe('Grep', () => {
		it('parses file:line:content format into list items', () => {
			const result = extractToolOutput(
				'Grep',
				{},
				'src/app.tsx:10:const x = 1;\nsrc/app.tsx:20:const y = 2;',
			);
			expect(result.type).toBe('list');
			if (result.type === 'list') {
				expect(result.items).toHaveLength(2);
				expect(result.items[0]).toEqual({
					primary: 'const x = 1;',
					secondary: 'src/app.tsx:10',
				});
			}
		});
	});

	describe('Glob', () => {
		it('extracts filenames from PostToolUse structured response', () => {
			// Actual PostToolUse shape: {filenames: string[], durationMs, numFiles, truncated}
			const result = extractToolOutput(
				'Glob',
				{},
				{
					filenames: ['/home/user/a.ts', '/home/user/b.ts'],
					durationMs: 42,
					numFiles: 2,
					truncated: false,
				},
			);
			expect(result.type).toBe('list');
			if (result.type === 'list') {
				expect(result.items).toHaveLength(2);
				expect(result.items[0]!.primary).toBe('/home/user/a.ts');
			}
		});

		it('falls back to string response', () => {
			const result = extractToolOutput('Glob', {}, 'a.ts\nb.ts\nc.ts');
			expect(result.type).toBe('list');
			if (result.type === 'list') {
				expect(result.items).toHaveLength(3);
			}
		});
	});

	describe('WebFetch', () => {
		it('extracts result from PostToolUse structured response', () => {
			// Actual PostToolUse shape: {bytes, code, codeText, result, durationMs, url}
			const result = extractToolOutput(
				'WebFetch',
				{url: 'https://example.com'},
				{
					bytes: 513,
					code: 200,
					codeText: 'OK',
					result: 'This is the page content summary.',
					durationMs: 2496,
					url: 'https://example.com',
				},
			);
			expect(result).toEqual({
				type: 'text',
				content: 'This is the page content summary.',
			});
		});

		it('falls back to text for string response', () => {
			const result = extractToolOutput('WebFetch', {}, 'Some summary text');
			expect(result).toEqual({type: 'text', content: 'Some summary text'});
		});
	});

	describe('WebSearch', () => {
		it('extracts titles and URLs from PostToolUse nested content array', () => {
			// Actual PostToolUse shape: {query, results: [{tool_use_id, content: [{title, url}...]}], durationSeconds}
			const result = extractToolOutput(
				'WebSearch',
				{},
				{
					query: 'test query',
					results: [
						{
							tool_use_id: 'srvtoolu_123',
							content: [
								{title: 'Result 1', url: 'https://example.com/1'},
								{title: 'Result 2', url: 'https://example.com/2'},
							],
						},
					],
					durationSeconds: 5,
				},
			);
			expect(result.type).toBe('list');
			if (result.type === 'list') {
				expect(result.items).toHaveLength(2);
				expect(result.items[0]).toEqual({
					primary: 'Result 1',
					secondary: 'https://example.com/1',
				});
			}
		});

		it('handles direct {title, url} objects in results', () => {
			const result = extractToolOutput(
				'WebSearch',
				{},
				{
					results: [{title: 'Result 1', url: 'https://example.com/1'}],
				},
			);
			expect(result.type).toBe('list');
			if (result.type === 'list') {
				expect(result.items[0]).toEqual({
					primary: 'Result 1',
					secondary: 'https://example.com/1',
				});
			}
		});

		it('falls back to text for non-structured response', () => {
			const result = extractToolOutput('WebSearch', {}, 'Some summary text');
			expect(result).toEqual({type: 'text', content: 'Some summary text'});
		});
	});

	describe('unknown tool', () => {
		it('falls back to text', () => {
			const result = extractToolOutput('SomeMCPTool', {}, 'response text');
			expect(result).toEqual({type: 'text', content: 'response text'});
		});

		it('handles null response', () => {
			const result = extractToolOutput('Unknown', {}, null);
			expect(result).toEqual({type: 'text', content: ''});
		});
	});
});
