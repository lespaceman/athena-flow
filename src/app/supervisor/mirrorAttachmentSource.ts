/**
 * Adapts the on-disk attachment mirror (`~/.config/athena/attachments.json`)
 * into an `AttachmentSource` for the supervisor:
 *
 *   - `initial()` reads the current mirror and projects each entry to a
 *     `DesiredAttachment` (attachmentId === runnerId today; see
 *     `infra/config/channels.ts`).
 *   - `subscribe(handler)` watches the file for changes (the runtime daemon
 *     rewrites it whenever a dashboard `attachments.changed` frame arrives)
 *     and re-emits the projected list.
 *
 * Watching the mirror file decouples the supervisor from the dashboard
 * transport — any process that updates the file (today: runtime daemon;
 * tomorrow: a future CLI-side push) feeds the supervisor automatically.
 *
 * See ADR 0001 phase 5.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
	attachmentMirrorPath,
	readAttachmentMirror,
} from '../../infra/config/attachmentMirror';
import type {DesiredAttachment} from './attachmentSet';
import type {AttachmentSource, SupervisorLog} from './runSupervisor';

export type MirrorAttachmentSourceOptions = {
	env?: NodeJS.ProcessEnv;
	log?: SupervisorLog;
};

export type MirrorAttachmentSource = AttachmentSource & {
	close(): void;
};

export function createMirrorAttachmentSource(
	opts: MirrorAttachmentSourceOptions = {},
): MirrorAttachmentSource {
	const env = opts.env ?? process.env;
	const log = opts.log ?? (() => {});
	const file = attachmentMirrorPath(env);
	const dir = path.dirname(file);
	const basename = path.basename(file);

	const handlers = new Set<(next: DesiredAttachment[]) => void>();
	let watcher: fs.FSWatcher | null = null;
	let closed = false;

	function project(): DesiredAttachment[] {
		const mirror = readAttachmentMirror(env);
		if (!mirror) return [];
		return mirror.attachments.map(a => ({
			attachmentId: a.runnerId,
			runnerId: a.runnerId,
		}));
	}

	function emit(): void {
		if (closed) return;
		let next: DesiredAttachment[];
		try {
			next = project();
		} catch (err) {
			log(
				'warn',
				`supervisor: failed to read attachment mirror: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
			return;
		}
		for (const handler of handlers) handler(next);
	}

	function ensureWatcher(): void {
		if (watcher || closed) return;
		try {
			fs.mkdirSync(dir, {recursive: true, mode: 0o700});
		} catch {
			// best-effort; readAttachmentMirror surfaces real errors
		}
		try {
			watcher = fs.watch(dir, (_evt, filename) => {
				if (filename && filename !== basename) return;
				emit();
			});
			watcher.on('error', err => {
				log(
					'warn',
					`supervisor: mirror watcher error: ${
						err instanceof Error ? err.message : String(err)
					}`,
				);
			});
		} catch (err) {
			log(
				'warn',
				`supervisor: failed to watch mirror dir ${dir}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
	}

	return {
		initial(): DesiredAttachment[] {
			return project();
		},
		subscribe(handler): () => void {
			handlers.add(handler);
			ensureWatcher();
			return () => {
				handlers.delete(handler);
			};
		},
		close(): void {
			closed = true;
			handlers.clear();
			if (watcher) {
				try {
					watcher.close();
				} catch {
					// best-effort
				}
				watcher = null;
			}
		},
	};
}
