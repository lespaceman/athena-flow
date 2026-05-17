import type {
	InstanceSocketClient,
	InstanceSocketFrame,
	InstanceSocketLogger,
} from './instanceSocketClient';
import type {DashboardPairedExecution} from './dashboardPairedExecution';
import {isRemoteAssignmentAdmissible} from './remoteRunExecutor';

type JobAssignmentFrame = Extract<
	InstanceSocketFrame,
	{type: 'job_assignment'}
>;

export type DashboardAssignmentIntakeOptions = {
	client: Pick<InstanceSocketClient, 'sendAssignmentAccepted'>;
	execution: Pick<
		DashboardPairedExecution,
		'admitAssignment' | 'rejectAssignment'
	>;
	log?: InstanceSocketLogger;
};

export type DashboardAssignmentIntake = {
	receive(frame: JobAssignmentFrame): void;
	markReady(): void;
	markNotReady(): void;
};

export function createDashboardAssignmentIntake(
	options: DashboardAssignmentIntakeOptions,
): DashboardAssignmentIntake {
	const log = options.log ?? (() => {});
	const pending: JobAssignmentFrame[] = [];
	let ready = false;

	function handle(frame: JobAssignmentFrame): void {
		if (!isRemoteAssignmentAdmissible(frame)) {
			options.execution.rejectAssignment(
				frame.runId,
				'remote assignment missing prompt',
			);
			return;
		}
		const outcome = options.execution.admitAssignment(frame);
		if (outcome === 'accepted') {
			options.client.sendAssignmentAccepted(frame.runId);
		}
	}

	function drain(): void {
		if (!ready) return;
		while (pending.length > 0) {
			const frame = pending.shift();
			if (frame) handle(frame);
		}
	}

	return {
		receive(frame) {
			if (!ready) {
				pending.push(frame);
				log(
					'debug',
					`dashboard assignment buffered until attachments are current: runId=${frame.runId}`,
				);
				return;
			}
			handle(frame);
		},
		markReady() {
			ready = true;
			drain();
		},
		markNotReady() {
			ready = false;
		},
	};
}
