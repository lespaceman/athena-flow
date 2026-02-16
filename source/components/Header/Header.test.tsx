import React from 'react';
import {render} from 'ink-testing-library';
import {test, expect} from 'vitest';
import Header from './Header.js';

const baseProps = {
	version: '1.2.3',
	modelName: 'claude-opus-4-6',
	projectDir: '/home/user/project',
	terminalWidth: 120,
	claudeState: 'idle' as const,
	spinnerFrame: '',
	toolCallCount: 23,
	contextSize: 148000,
	isServerRunning: true,
};

test('renders as single line with ATHENA label', () => {
	const {lastFrame} = render(<Header {...baseProps} />);
	const output = lastFrame()!;
	expect(output).toContain('ATHENA');
	expect(output).toContain('v1.2.3');
});

test('shows state label', () => {
	const {lastFrame} = render(
		<Header {...baseProps} claudeState="working" spinnerFrame="⠋" />,
	);
	expect(lastFrame()).toContain('working');
});

test('shows model name and metrics', () => {
	const {lastFrame} = render(<Header {...baseProps} />);
	const output = lastFrame()!;
	expect(output).toContain('Opus 4.6');
	expect(output).toContain('23');
});

test('handles null modelName', () => {
	const {lastFrame} = render(<Header {...baseProps} modelName={null} />);
	expect(lastFrame()).toContain('--');
});

test('shows server status indicator', () => {
	const {lastFrame} = render(<Header {...baseProps} isServerRunning={true} />);
	expect(lastFrame()).toContain('●');
});
