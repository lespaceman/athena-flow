import {describe, expect, it, vi} from 'vitest';
import type {AttachmentSet, DesiredAttachment} from './attachmentSet';
import {runSupervisor} from './runSupervisor';

function fakeSet(): AttachmentSet & {
	reconcile: ReturnType<typeof vi.fn>;
	shutdown: ReturnType<typeof vi.fn>;
	list: ReturnType<typeof vi.fn>;
} {
	return {
		reconcile: vi.fn(async () => {}),
		shutdown: vi.fn(async () => {}),
		list: vi.fn(() => []),
	};
}

type FakeSource = {
	initial: () => DesiredAttachment[];
	subscribe: (handler: (next: DesiredAttachment[]) => void) => () => void;
	emit(next: DesiredAttachment[]): void;
	unsubscribed: boolean;
};

function fakeSource(initial: DesiredAttachment[]): FakeSource {
	let handler: ((next: DesiredAttachment[]) => void) | null = null;
	const source: FakeSource = {
		initial: () => initial,
		subscribe(h) {
			handler = h;
			return () => {
				handler = null;
				source.unsubscribed = true;
			};
		},
		emit(next) {
			handler?.(next);
		},
		unsubscribed: false,
	};
	return source;
}

describe('runSupervisor', () => {
	it('reconciles the AttachmentSet against the source initial list on start', async () => {
		const set = fakeSet();
		const source = fakeSource([{attachmentId: 'a1', runnerId: 'r1'}]);
		await runSupervisor({source, set});
		expect(set.reconcile).toHaveBeenCalledTimes(1);
		expect(set.reconcile).toHaveBeenCalledWith([
			{attachmentId: 'a1', runnerId: 'r1'},
		]);
	});

	it('reconciles again when the source emits a change', async () => {
		const set = fakeSet();
		const source = fakeSource([{attachmentId: 'a1', runnerId: 'r1'}]);
		await runSupervisor({source, set});
		source.emit([
			{attachmentId: 'a1', runnerId: 'r1'},
			{attachmentId: 'a2', runnerId: 'r2'},
		]);
		await Promise.resolve();
		expect(set.reconcile).toHaveBeenCalledTimes(2);
		expect(set.reconcile).toHaveBeenLastCalledWith([
			{attachmentId: 'a1', runnerId: 'r1'},
			{attachmentId: 'a2', runnerId: 'r2'},
		]);
	});

	it('shutdown() unsubscribes from the source and stops the AttachmentSet', async () => {
		const set = fakeSet();
		const source = fakeSource([]);
		const handle = await runSupervisor({source, set});
		await handle.shutdown();
		expect(source.unsubscribed).toBe(true);
		expect(set.shutdown).toHaveBeenCalledTimes(1);
	});

	it('after shutdown(), late source emissions do not trigger reconcile', async () => {
		const set = fakeSet();
		const source = fakeSource([{attachmentId: 'a1', runnerId: 'r1'}]);
		const handle = await runSupervisor({source, set});
		await handle.shutdown();
		set.reconcile.mockClear();
		source.emit([{attachmentId: 'a2', runnerId: 'r2'}]);
		await Promise.resolve();
		expect(set.reconcile).not.toHaveBeenCalled();
	});

	it('logs and continues when reconcile throws (does not propagate)', async () => {
		const set = fakeSet();
		set.reconcile
			.mockRejectedValueOnce(new Error('boom'))
			.mockResolvedValue(undefined);
		const source = fakeSource([{attachmentId: 'a1', runnerId: 'r1'}]);
		const log = vi.fn();
		await runSupervisor({source, set, log});
		expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('boom'));
		// next emit still reconciles
		source.emit([{attachmentId: 'a2', runnerId: 'r2'}]);
		await Promise.resolve();
		await Promise.resolve();
		expect(set.reconcile).toHaveBeenCalledTimes(2);
	});
});
