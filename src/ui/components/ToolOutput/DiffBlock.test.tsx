import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import DiffBlock from './DiffBlock';
import {type DiffHunk} from '../../../shared/types/toolOutput';

describe('DiffBlock', () => {
	it('returns null for empty old and new text', () => {
		const {lastFrame} = render(<DiffBlock oldText="" newText="" />);
		expect(lastFrame()).toBe('');
	});

	it('renders old lines with - prefix and new lines with + prefix', () => {
		const {lastFrame} = render(
			<DiffBlock oldText="old line" newText="new line" />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('- old line');
		expect(frame).toContain('+ new line');
	});

	it('truncates when total lines exceed maxLines', () => {
		const oldText = Array.from({length: 30}, (_, i) => `old ${i}`).join('\n');
		const newText = Array.from({length: 30}, (_, i) => `new ${i}`).join('\n');
		const {lastFrame} = render(
			<DiffBlock oldText={oldText} newText={newText} maxLines={10} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('more lines');
		expect(frame).not.toContain('old 29');
	});

	it('renders hunk header and line numbers when hunks provided', () => {
		const hunks: DiffHunk[] = [
			{
				header: '@@ -10,3 +10,3 @@ function foo()',
				oldStart: 10,
				newStart: 10,
				lines: [
					{
						type: 'context',
						content: 'const x = 0;',
						oldLineNo: 10,
						newLineNo: 10,
					},
					{type: 'remove', content: 'const a = 1;', oldLineNo: 11},
					{type: 'add', content: 'const a = 2;', newLineNo: 11},
					{
						type: 'context',
						content: 'const b = 3;',
						oldLineNo: 12,
						newLineNo: 12,
					},
				],
			},
		];
		const {lastFrame} = render(
			<DiffBlock oldText="" newText="" hunks={hunks} filePath="src/foo.ts" />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('@@');
		expect(frame).toContain('const a = 1;');
		expect(frame).toContain('const a = 2;');
	});

	it('falls back to old/new text rendering when hunks not provided', () => {
		const {lastFrame} = render(<DiffBlock oldText="old" newText="new" />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('- old');
		expect(frame).toContain('+ new');
	});

	it('renders side-by-side when availableWidth >= 120', () => {
		const hunks: DiffHunk[] = [
			{
				header: '@@ -1,1 +1,1 @@',
				oldStart: 1,
				newStart: 1,
				lines: [
					{type: 'remove', content: 'old line', oldLineNo: 1},
					{type: 'add', content: 'new line', newLineNo: 1},
				],
			},
		];
		const {lastFrame} = render(
			<DiffBlock oldText="" newText="" hunks={hunks} availableWidth={140} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('old line');
		expect(frame).toContain('new line');
	});
});
