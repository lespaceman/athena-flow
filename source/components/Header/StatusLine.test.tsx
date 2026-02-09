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
};

describe('StatusLine', () => {
	it('shows server running status', () => {
		const {lastFrame} = render(<StatusLine {...defaultProps} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Hook server: running');
	});

	it('shows server stopped status', () => {
		const {lastFrame} = render(
			<StatusLine {...defaultProps} isServerRunning={false} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Hook server: stopped');
	});

	it('shows Claude idle state', () => {
		const {lastFrame} = render(<StatusLine {...defaultProps} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Claude: idle');
	});

	it('shows Claude working state', () => {
		const {lastFrame} = render(
			<StatusLine {...defaultProps} claudeState="working" spinnerFrame="⠋" />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Claude: working');
	});

	it('shows Claude waiting state', () => {
		const {lastFrame} = render(
			<StatusLine {...defaultProps} claudeState="waiting" />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Claude: waiting for input');
	});

	it('does not show socket path when not verbose', () => {
		const {lastFrame} = render(<StatusLine {...defaultProps} />);
		const frame = lastFrame() ?? '';

		expect(frame).not.toContain('/tmp/ink.sock');
	});

	it('shows socket path when verbose', () => {
		const {lastFrame} = render(<StatusLine {...defaultProps} verbose={true} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('/tmp/ink.sock');
	});

	it('shows model name, tool count, and tokens', () => {
		const {lastFrame} = render(
			<StatusLine
				{...defaultProps}
				modelName="claude-opus-4-6"
				toolCallCount={12}
				tokenTotal={53300}
			/>,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('Opus 4.6');
		expect(frame).toContain('Tools: 12');
		expect(frame).toContain('Tokens: 53.3k');
	});

	it('shows -- for null model and tokens', () => {
		const {lastFrame} = render(<StatusLine {...defaultProps} />);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('--');
		expect(frame).toContain('Tools: 0');
	});
});
