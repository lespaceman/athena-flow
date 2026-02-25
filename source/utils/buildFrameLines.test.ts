import {describe, it, expect} from 'vitest';
import {buildFrameLines, type FrameContext} from './buildFrameLines.js';

const baseCtx: FrameContext = {
	innerWidth: 80,
	focusMode: 'input',
	inputMode: 'normal',
	searchQuery: '',
	searchMatches: [],
	searchMatchPos: 0,
	expandedEntry: null,
	isClaudeRunning: false,
	inputValue: '',
	cursorOffset: 0,
	dialogActive: false,
	dialogType: '',
	lastRunStatus: null,
};

describe('buildFrameLines contextual prompt', () => {
	it('shows default prompt when no run has completed', () => {
		const {inputLines} = buildFrameLines(baseCtx);
		const line = inputLines.join('');
		expect(line).toContain('Type a prompt or :command');
	});

	it('shows contextual prompt after completed run (X2)', () => {
		const {inputLines} = buildFrameLines({
			...baseCtx,
			lastRunStatus: 'completed',
		});
		const line = inputLines.join('');
		expect(line).toContain('Run complete');
	});

	it('shows contextual prompt after failed run (X2)', () => {
		const {inputLines} = buildFrameLines({...baseCtx, lastRunStatus: 'failed'});
		const line = inputLines.join('');
		expect(line).toContain('Run failed');
	});
});
