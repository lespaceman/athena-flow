import {describe, it, expect} from 'vitest';
import {buildCodexDisplay} from '../displayTitle';

describe('buildCodexDisplay', () => {
	it('describes a `read` commandAction', () => {
		const result = buildCodexDisplay('tool.pre', {
			tool_name: 'Bash',
			tool_input: {
				command: 'sed -n 1,200p foo.ts',
				commandActions: [{type: 'read', name: 'foo.ts'}],
			},
		});
		expect(result).toEqual({title: 'Read foo.ts'});
	});

	it('describes a `search` commandAction with path', () => {
		const result = buildCodexDisplay('tool.pre', {
			tool_name: 'Bash',
			tool_input: {
				commandActions: [
					{type: 'search', query: 'tracker.md', path: '.athena'},
				],
			},
		});
		expect(result).toEqual({title: "Search 'tracker.md' in .athena"});
	});

	it('omits redundant root path for search', () => {
		const result = buildCodexDisplay('tool.pre', {
			tool_name: 'Bash',
			tool_input: {commandActions: [{type: 'search', query: 'foo', path: '.'}]},
		});
		expect(result).toEqual({title: "Search 'foo'"});
	});

	it('describes a `listFiles` commandAction', () => {
		const result = buildCodexDisplay('tool.pre', {
			tool_name: 'Bash',
			tool_input: {commandActions: [{type: 'listFiles', path: 'src'}]},
		});
		expect(result).toEqual({title: 'List src'});
	});

	it('returns undefined for `unknown` action type', () => {
		const result = buildCodexDisplay('tool.pre', {
			tool_name: 'Bash',
			tool_input: {commandActions: [{type: 'unknown', command: 'foo'}]},
		});
		expect(result).toBeUndefined();
	});

	it('returns undefined when commandActions is missing or empty', () => {
		expect(
			buildCodexDisplay('tool.pre', {
				tool_name: 'Bash',
				tool_input: {command: 'ls'},
			}),
		).toBeUndefined();
		expect(
			buildCodexDisplay('tool.pre', {
				tool_name: 'Bash',
				tool_input: {commandActions: []},
			}),
		).toBeUndefined();
	});

	it('returns undefined for non-Bash tools', () => {
		const result = buildCodexDisplay('tool.pre', {
			tool_name: 'WebSearch',
			tool_input: {query: 'foo'},
		});
		expect(result).toBeUndefined();
	});

	it('returns undefined for non-tool kinds', () => {
		const result = buildCodexDisplay('session.start', {source: 'startup'});
		expect(result).toBeUndefined();
	});
});
