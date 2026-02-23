import React from 'react';
import {describe, it, expect, vi, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import CodeBlock from './CodeBlock.js';

describe('CodeBlock', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('renders content', () => {
		const {lastFrame} = render(
			<CodeBlock content="const x = 1;" language="typescript" />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('const x = 1;');
	});

	it('returns null for empty content', () => {
		const {lastFrame} = render(<CodeBlock content="" />);
		expect(lastFrame()).toBe('');
	});

	it('truncates beyond maxLines', () => {
		const content = Array.from({length: 20}, (_, i) => `line ${i}`).join(
			'\n',
		);
		const {lastFrame} = render(<CodeBlock content={content} maxLines={5} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('more lines');
		expect(frame).not.toContain('line 19');
	});

	it('wraps absolute file paths with OSC 8 when supported', () => {
		vi.stubEnv('ATHENA_HYPERLINKS', '1');
		const content = 'Error at /home/user/src/app.ts:42:10';
		const {lastFrame} = render(
			<CodeBlock content={content} language="bash" />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('\x1b]8;;');
		expect(frame).toContain('/home/user/src/app.ts');
	});

	it('does not wrap file paths when hyperlinks not supported', () => {
		vi.stubEnv('ATHENA_HYPERLINKS', '0');
		vi.stubEnv('TERM_PROGRAM', '');
		vi.stubEnv('WT_SESSION', '');
		vi.stubEnv('VTE_VERSION', '');
		vi.stubEnv('TERM', 'xterm-256color');
		const content = 'Error at /home/user/src/app.ts:42:10';
		const {lastFrame} = render(
			<CodeBlock content={content} language="bash" />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('\x1b]8;;');
	});
});
