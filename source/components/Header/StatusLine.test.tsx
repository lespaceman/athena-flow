import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import StatusLine from './StatusLine.js';
import type {ClaudeState} from '../../types/headerMetrics.js';

const defaultProps = {
	isServerRunning: true,
	socketPath: '/tmp/ink.sock',
	claudeState: 'idle' as ClaudeState,
	verbose: false,
	spinnerFrame: '',
	modelName: null as string | null,
	toolCallCount: 0,
	tokenTotal: null as number | null,
	projectDir: '/tmp/project',
};

describe('StatusLine', () => {
	it('renders server status, Claude state, and verbose socket path', () => {
		// Server running + Claude idle (defaults)
		const running = render(<StatusLine {...defaultProps} />);
		const runningFrame = running.lastFrame() ?? '';
		expect(runningFrame).toContain('Hook server: running');
		expect(runningFrame).toContain('Athena: idle');
		expect(runningFrame).not.toContain('/tmp/ink.sock');
		running.unmount();

		// Server stopped
		const stopped = render(
			<StatusLine {...defaultProps} isServerRunning={false} />,
		);
		expect(stopped.lastFrame() ?? '').toContain('Hook server: stopped');
		stopped.unmount();

		// Claude working with spinner
		const working = render(
			<StatusLine {...defaultProps} claudeState="working" spinnerFrame="⠋" />,
		);
		expect(working.lastFrame() ?? '').toContain('Athena: working');
		working.unmount();

		// Claude waiting
		const waiting = render(
			<StatusLine {...defaultProps} claudeState="waiting" />,
		);
		expect(waiting.lastFrame() ?? '').toContain('Athena: waiting for input');
		waiting.unmount();

		// Verbose mode shows socket path
		const verbose = render(<StatusLine {...defaultProps} verbose={true} />);
		expect(verbose.lastFrame() ?? '').toContain('/tmp/ink.sock');
		verbose.unmount();
	});

	it('renders model name, tool count, and token metrics', () => {
		// Null/default values show placeholders
		const defaults = render(<StatusLine {...defaultProps} />);
		const defaultFrame = defaults.lastFrame() ?? '';
		expect(defaultFrame).toContain('--');
		expect(defaultFrame).toContain('Tools: 0');
		defaults.unmount();

		// Populated values show formatted output
		const populated = render(
			<StatusLine
				{...defaultProps}
				modelName="claude-opus-4-6"
				toolCallCount={12}
				tokenTotal={53300}
			/>,
		);
		const populatedFrame = populated.lastFrame() ?? '';
		expect(populatedFrame).toContain('Opus 4.6');
		expect(populatedFrame).toContain('Tools: 12');
		expect(populatedFrame).toContain('Tokens: 53.3k');
		populated.unmount();
	});

	it('shows project directory path', () => {
		const {lastFrame} = render(
			<StatusLine {...defaultProps} projectDir="/home/user/my-project" />,
		);

		expect(lastFrame() ?? '').toContain('my-project');
	});
});
