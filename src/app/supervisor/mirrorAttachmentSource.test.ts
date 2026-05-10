import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {
	attachmentMirrorPath,
	writeAttachmentMirror,
} from '../../infra/config/attachmentMirror';
import {createMirrorAttachmentSource} from './mirrorAttachmentSource';

function mkHome(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'athena-sup-src-'));
}

async function tick(ms = 30): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, ms));
}

describe('mirrorAttachmentSource', () => {
	it('initial() returns desired attachments derived from the mirror file', () => {
		const home = mkHome();
		const env = {HOME: home};
		writeAttachmentMirror(
			{
				instanceId: 'inst_1',
				fetchedAt: 1,
				attachments: [{runnerId: 'r1'}, {runnerId: 'r2', name: 'two'}],
			},
			env,
		);
		const source = createMirrorAttachmentSource({env});
		try {
			expect(source.initial()).toEqual([
				{attachmentId: 'r1', runnerId: 'r1'},
				{attachmentId: 'r2', runnerId: 'r2'},
			]);
		} finally {
			source.close();
		}
	});

	it('initial() returns [] when the mirror file is missing', () => {
		const home = mkHome();
		const source = createMirrorAttachmentSource({env: {HOME: home}});
		try {
			expect(source.initial()).toEqual([]);
		} finally {
			source.close();
		}
	});

	it('subscribe() fires the handler with the new desired list when the mirror file changes', async () => {
		const home = mkHome();
		const env = {HOME: home};
		writeAttachmentMirror(
			{instanceId: 'inst_1', fetchedAt: 1, attachments: [{runnerId: 'r1'}]},
			env,
		);
		const source = createMirrorAttachmentSource({env});
		const handler = vi.fn();
		const unsubscribe = source.subscribe(handler);
		try {
			writeAttachmentMirror(
				{
					instanceId: 'inst_1',
					fetchedAt: 2,
					attachments: [{runnerId: 'r1'}, {runnerId: 'r2'}],
				},
				env,
			);
			// fs.watch needs a moment to deliver the event
			for (let i = 0; i < 20 && handler.mock.calls.length === 0; i++) {
				await tick();
			}
			expect(handler).toHaveBeenCalled();
			expect(handler.mock.calls.at(-1)?.[0]).toEqual([
				{attachmentId: 'r1', runnerId: 'r1'},
				{attachmentId: 'r2', runnerId: 'r2'},
			]);
		} finally {
			unsubscribe();
			source.close();
		}
	});

	it('close() stops subsequent change events from firing', async () => {
		const home = mkHome();
		const env = {HOME: home};
		writeAttachmentMirror(
			{instanceId: 'inst_1', fetchedAt: 1, attachments: [{runnerId: 'r1'}]},
			env,
		);
		const source = createMirrorAttachmentSource({env});
		const handler = vi.fn();
		source.subscribe(handler);
		source.close();
		writeAttachmentMirror(
			{
				instanceId: 'inst_1',
				fetchedAt: 2,
				attachments: [{runnerId: 'r1'}, {runnerId: 'r2'}],
			},
			env,
		);
		await tick(80);
		expect(handler).not.toHaveBeenCalled();
	});

	it('logs and skips emission when the mirror is invalid after a change', async () => {
		const home = mkHome();
		const env = {HOME: home};
		writeAttachmentMirror(
			{instanceId: 'inst_1', fetchedAt: 1, attachments: [{runnerId: 'r1'}]},
			env,
		);
		const log = vi.fn();
		const source = createMirrorAttachmentSource({env, log});
		const handler = vi.fn();
		source.subscribe(handler);
		try {
			fs.writeFileSync(attachmentMirrorPath(env), '{not valid json');
			for (let i = 0; i < 20 && log.mock.calls.length === 0; i++) {
				await tick();
			}
			expect(log).toHaveBeenCalledWith(
				'warn',
				expect.stringMatching(/mirror/i),
			);
			expect(handler).not.toHaveBeenCalled();
		} finally {
			source.close();
		}
	});
});
