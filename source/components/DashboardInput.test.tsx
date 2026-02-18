import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import DashboardInput from './DashboardInput.js';

const KEY = {ENTER: '\r'};

async function typeAndWait(
	stdin: {write: (value: string) => void},
	value: string,
) {
	stdin.write(value);
	await new Promise(resolve => setTimeout(resolve, 0));
}

describe('DashboardInput', () => {
	it('renders placeholder and run label', () => {
		const {lastFrame} = render(
			<DashboardInput width={60} onSubmit={vi.fn()} runLabel="RUN" />,
		);

		const frame = lastFrame() ?? '';
		expect(frame).toContain('input>');
		expect(frame).toContain('[RUN]');
		expect(frame).toContain('Type a message or /command');
	});

	it('submits entered text on enter', async () => {
		const onSubmit = vi.fn();
		const {stdin} = render(
			<DashboardInput width={60} onSubmit={onSubmit} runLabel="SEND" />,
		);

		await typeAndWait(stdin, 'hello world');
		await typeAndWait(stdin, KEY.ENTER);
		expect(onSubmit).toHaveBeenCalledWith('hello world');
	});

	it('supports history callbacks via ctrl+p / ctrl+n', async () => {
		const onHistoryBack = vi.fn().mockReturnValue('prev prompt');
		const onHistoryForward = vi.fn().mockReturnValue('next prompt');
		const {stdin, lastFrame} = render(
			<DashboardInput
				width={60}
				onSubmit={vi.fn()}
				onHistoryBack={onHistoryBack}
				onHistoryForward={onHistoryForward}
			/>,
		);

		await typeAndWait(stdin, '\x10'); // Ctrl+P
		expect(onHistoryBack).toHaveBeenCalled();
		expect(lastFrame() ?? '').toContain('prev prompt');

		await typeAndWait(stdin, '\x0e'); // Ctrl+N
		expect(onHistoryForward).toHaveBeenCalled();
		expect(lastFrame() ?? '').toContain('next prompt');
	});
});
