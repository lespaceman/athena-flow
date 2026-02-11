import React from 'react';
import {render} from 'ink-testing-library';
import {test, expect} from 'vitest';
import Header from './Header.js';

const baseProps = {
	version: '1.2.3',
	modelName: 'claude-opus-4-6',
	projectDir: '/home/user/Projects/my-app',
	terminalWidth: 100,
};

// ink-testing-library accepts {columns} at runtime but the types don't expose it
const renderWide = (el: React.ReactElement) =>
	(render as Function)(el, {columns: 100});
const renderNarrow = (el: React.ReactElement) =>
	(render as Function)(el, {columns: 60});

test('renders full header with both panels at wide width', () => {
	const {lastFrame} = renderWide(<Header {...baseProps} />);
	const output = lastFrame();

	expect(output).toContain('Welcome back!');
	expect(output).toContain('Opus 4.6');
	expect(output).toContain('Athena v1.2.3');
	expect(output).toContain('Tips for getting started');
});

test('hides right panel when terminal is narrow', () => {
	const {lastFrame} = renderNarrow(
		<Header {...baseProps} terminalWidth={60} />,
	);
	const output = lastFrame();

	expect(output).toContain('Welcome back!');
	expect(output).not.toContain('Tips for getting started');
});

test('handles null modelName', () => {
	const {lastFrame} = renderWide(<Header {...baseProps} modelName={null} />);
	const output = lastFrame();

	expect(output).toContain('--');
	expect(output).toContain('Athena v1.2.3');
});
