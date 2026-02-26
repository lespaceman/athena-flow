import {describe, it, expect} from 'vitest';
import {renderHeaderLines} from './renderHeaderLines.js';
import stripAnsi from 'strip-ansi';
import type {HeaderModel} from './headerModel.js';

const model: HeaderModel = {
	session_id: 'abc123',
	workflow: 'test-wf',
	harness: 'Claude Code',
	context: {used: 50000, max: 200000},
	status: 'idle',
	tail_mode: false,
};

describe('renderHeaderLines', () => {
	it('renders context bar with progress characters (X1)', () => {
		const [line] = renderHeaderLines(model, 120, true);
		const plain = stripAnsi(line);
		// Should contain "Context" label and token counts, NOT plain "Ctx:"
		expect(plain).toContain('Context');
		expect(plain).toContain('50k/200k');
		expect(plain).not.toContain('Ctx:');
	});

	it('renders context bar without color when hasColor is false', () => {
		const [line] = renderHeaderLines(model, 120, false);
		// ASCII bar uses brackets
		expect(line).toContain('[');
		expect(line).toContain('50k/200k');
	});
});
