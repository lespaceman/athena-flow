import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import Header, {shortenPath} from './Header.js';

vi.mock('node:os', () => ({
	default: {homedir: () => '/home/testuser'},
}));

describe('Header', () => {
	it('renders the version string', () => {
		const {lastFrame} = render(
			<Header version="0.1.0" projectDir="/home/testuser/project" />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('v0.1.0');
	});

	it('renders the model name', () => {
		const {lastFrame} = render(
			<Header version="0.1.0" projectDir="/home/testuser/project" />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Opus 4.5');
	});

	it('renders Athena name', () => {
		const {lastFrame} = render(
			<Header version="0.1.0" projectDir="/home/testuser/project" />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Athena');
	});

	it('shortens home directory to ~', () => {
		const {lastFrame} = render(
			<Header version="0.1.0" projectDir="/home/testuser/project" />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('~/project');
	});
});

describe('shortenPath', () => {
	it('replaces home directory with ~', () => {
		expect(shortenPath('/home/testuser/Documents')).toBe('~/Documents');
	});

	it('leaves paths outside home unchanged', () => {
		expect(shortenPath('/tmp/project')).toBe('/tmp/project');
	});
});
