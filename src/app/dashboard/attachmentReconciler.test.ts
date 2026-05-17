import {describe, expect, it, vi} from 'vitest';
import {createAttachmentReconciler} from './attachmentReconciler';

describe('AttachmentReconciler', () => {
	it('uses the latest pushed full list when a push races a reconnect fetch', async () => {
		let resolveFetch: (value: Array<{runnerId: string}>) => void = () => {};
		const writeMirror = vi.fn();
		const reconciler = createAttachmentReconciler({
			writeMirror,
			now: () => 100,
			fetchAttachments: async () =>
				new Promise(resolve => {
					resolveFetch = resolve;
				}),
		});

		const reconcile = reconciler.reconcileNow({
			dashboardUrl: 'https://example.com',
			instanceId: 'inst_1',
			accessToken: 'token',
		});
		reconciler.applyPush({
			instanceId: 'inst_1',
			attachments: [{runnerId: 'r_push'}],
		});
		resolveFetch([{runnerId: 'r_fetch'}]);
		await reconcile;

		expect(writeMirror).toHaveBeenLastCalledWith({
			instanceId: 'inst_1',
			fetchedAt: 100,
			attachments: [{runnerId: 'r_push'}],
		});
		expect(reconciler.isCurrent('inst_1')).toBe(true);
	});
});
