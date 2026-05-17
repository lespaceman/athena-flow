import {describe, expect, it, vi} from 'vitest';
import {createDashboardAssignmentIntake} from './dashboardAssignmentIntake';

describe('DashboardAssignmentIntake', () => {
	it('buffers assignments until admission is allowed, then truthfully accepts them', () => {
		const sendAssignmentAccepted = vi.fn();
		const admitAssignment = vi.fn(() => 'accepted' as const);
		const rejectAssignment = vi.fn();
		const intake = createDashboardAssignmentIntake({
			client: {sendAssignmentAccepted},
			execution: {admitAssignment, rejectAssignment},
		});

		const frame = {
			type: 'job_assignment' as const,
			runId: 'run_1',
			runSpec: {prompt: 'hi'},
		};
		intake.receive(frame);
		expect(admitAssignment).not.toHaveBeenCalled();
		expect(sendAssignmentAccepted).not.toHaveBeenCalled();

		intake.markReady();
		expect(admitAssignment).toHaveBeenCalledWith(frame);
		expect(sendAssignmentAccepted).toHaveBeenCalledWith('run_1');
	});

	it('rejects malformed assignments without acknowledging them', () => {
		const sendAssignmentAccepted = vi.fn();
		const admitAssignment = vi.fn(() => 'accepted' as const);
		const rejectAssignment = vi.fn();
		const intake = createDashboardAssignmentIntake({
			client: {sendAssignmentAccepted},
			execution: {admitAssignment, rejectAssignment},
		});
		intake.markReady();
		intake.receive({
			type: 'job_assignment',
			runId: 'run_bad',
			runSpec: {},
		});

		expect(admitAssignment).not.toHaveBeenCalled();
		expect(sendAssignmentAccepted).not.toHaveBeenCalled();
		expect(rejectAssignment).toHaveBeenCalledWith(
			'run_bad',
			'remote assignment missing prompt',
		);
	});
});
