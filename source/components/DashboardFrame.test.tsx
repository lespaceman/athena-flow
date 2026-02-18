import React from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import DashboardFrame from './DashboardFrame.js';

describe('DashboardFrame', () => {
	it('renders ascii frame sections', () => {
		const {lastFrame} = render(
			<DashboardFrame
				width={72}
				headerLine1="ATHENA | session S123 | run R777: Checkout"
				headerLine2="RUNNING | step 1/3 | tools 1 | subagents 0 | errors 0 | tokens 120"
				todoHeader="[TODO] (run R777) 1 open / 0 doing"
				todoLines={['  [ ] verify cart flow']}
				timelineRows={[
					{
						time: '21:14:03',
						eventId: 'E101',
						type: 'user.message',
						actor: 'USER',
						summary: 'run checkout flow tests',
					},
				]}
					footerLine="/help /todo /sessions  up/down scroll  ctrl+p/n history  enter send"
				renderInput={innerWidth => (
					<Text>{`input> ${''.padEnd(Math.max(0, innerWidth - 13), ' ')}[RUN]`}</Text>
				)}
			/>,
		);

		const frame = lastFrame() ?? '';
		expect(frame).toContain('+');
		expect(frame).toContain('ATHENA | session');
		expect(frame).toContain('[TODO]');
		expect(frame).toContain('E101');
		expect(frame).toContain('input>');
		expect(frame).toContain('[RUN]');
	});

	it('adapts to narrow widths without overflowing lines', () => {
		const width = 40;
		const {lastFrame} = render(
			<DashboardFrame
				width={width}
				headerLine1="ATHENA | session S123 | run R777: A very long title"
				headerLine2="RUNNING | step 12/34 | tools 111 | subagents 3 | errors 2 | tokens 9,999"
				todoHeader="[TODO] (run R777) 12 open / 3 doing"
				todoLines={[
					'  [ ] first long todo that should truncate',
					'  [>] second long todo that should truncate',
				]}
				timelineRows={[
					{
						time: '21:14:03',
						eventId: 'E101-LONG',
						type: 'tool.result ERR',
						actor: 'AGENT-LONG',
						summary: 'waitForSelector "#otp" timeout after a very long delay',
					},
				]}
				footerLine="/help /todo /sessions  up/down scroll"
				renderInput={innerWidth => (
					<Text>{`input> ${''.padEnd(Math.max(0, innerWidth - 14), ' ')}[SEND]`}</Text>
				)}
			/>,
		);

		const frame = lastFrame() ?? '';
		const lines = frame.split('\n');
		for (const line of lines) {
			expect(line.length).toBeLessThanOrEqual(width);
		}
	});
});
