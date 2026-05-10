/**
 * Wires an attachment source (initial list + change subscription) to an
 * `AttachmentSet`, reconciling on start and on every change emission.
 *
 * The supervisor entry point (`src/app/entry/supervisor.tsx`) constructs the
 * source from the dashboard mirror + instance socket and the set from a
 * `createRunner` factory that spawns `drisp --attachment-id <id>` children.
 *
 * Reconcile failures are logged but never propagated — the supervisor must
 * keep running and respond to subsequent changes even if one cycle hits a
 * transient spawn or stop error.
 *
 * See ADR 0001 phase 5.
 */

import type {AttachmentSet, DesiredAttachment} from './attachmentSet';

export type AttachmentSource = {
	initial(): DesiredAttachment[];
	subscribe(handler: (next: DesiredAttachment[]) => void): () => void;
};

export type SupervisorLog = (level: 'warn' | 'info', message: string) => void;

export type RunSupervisorOptions = {
	source: AttachmentSource;
	set: AttachmentSet;
	log?: SupervisorLog;
};

export type SupervisorHandle = {
	shutdown(): Promise<void>;
};

export async function runSupervisor(
	opts: RunSupervisorOptions,
): Promise<SupervisorHandle> {
	const log = opts.log ?? (() => {});
	let stopped = false;

	async function safeReconcile(desired: DesiredAttachment[]): Promise<void> {
		if (stopped) return;
		try {
			await opts.set.reconcile(desired);
		} catch (err) {
			log(
				'warn',
				`supervisor: reconcile failed: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
	}

	const unsubscribe = opts.source.subscribe(next => {
		void safeReconcile(next);
	});

	await safeReconcile(opts.source.initial());

	return {
		async shutdown(): Promise<void> {
			stopped = true;
			unsubscribe();
			await opts.set.shutdown();
		},
	};
}
