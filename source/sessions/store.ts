import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {initSchema} from './schema.js';
import type {
	AthenaSession,
	AdapterSessionRecord,
	StoredSession,
} from './types.js';
import type {RuntimeEvent} from '../runtime/types.js';
import type {FeedEvent} from '../feed/types.js';

export type SessionStoreOptions = {
	sessionId: string;
	projectDir: string;
	dbPath: string; // ':memory:' for tests, file path for production
	label?: string;
};

export type SessionStore = {
	/** Atomically records a runtime event and its derived feed events in a single transaction. */
	recordEvent(event: RuntimeEvent, feedEvents: FeedEvent[]): void;
	/** Persists feed-only events (e.g. decisions) with null runtime_event_id. */
	recordFeedEvents(feedEvents: FeedEvent[]): void;
	restore(): StoredSession;
	getAthenaSession(): AthenaSession;
	updateLabel(label: string): void;
	close(): void;
};

export function createSessionStore(opts: SessionStoreOptions): SessionStore {
	// Ensure parent directory exists for file-based databases
	if (opts.dbPath !== ':memory:') {
		fs.mkdirSync(path.dirname(opts.dbPath), {recursive: true});
	}

	const db = new Database(opts.dbPath);
	initSchema(db);

	let runtimeSeq = 0;

	// Track known adapter session IDs to avoid duplicate inserts
	const knownAdapterSessions = new Set<string>();

	// Initialize session row
	const now = Date.now();
	db.prepare(
		`INSERT OR IGNORE INTO session (id, project_dir, created_at, updated_at, label)
		 VALUES (?, ?, ?, ?, ?)`,
	).run(opts.sessionId, opts.projectDir, now, now, opts.label ?? null);

	// If resuming, load existing state
	const existingMaxSeq = db
		.prepare('SELECT MAX(seq) as maxSeq FROM runtime_events')
		.get() as {maxSeq: number | null};
	if (existingMaxSeq.maxSeq !== null) {
		runtimeSeq = existingMaxSeq.maxSeq;
	}

	// Load known adapter sessions
	const existingAdapters = db
		.prepare('SELECT session_id FROM adapter_sessions')
		.all() as {session_id: string}[];
	for (const row of existingAdapters) {
		knownAdapterSessions.add(row.session_id);
	}

	// Prepared statements
	const insertRuntimeEvent = db.prepare(
		`INSERT OR IGNORE INTO runtime_events (id, seq, timestamp, hook_name, adapter_session_id, payload)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	);

	const insertFeedEvent = db.prepare(
		`INSERT OR IGNORE INTO feed_events (event_id, runtime_event_id, seq, kind, run_id, actor_id, timestamp, data)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	);

	const insertAdapterSession = db.prepare(
		`INSERT OR IGNORE INTO adapter_sessions (session_id, started_at)
		 VALUES (?, ?)`,
	);

	const updateSessionTimestamp = db.prepare(
		`UPDATE session SET updated_at = ? WHERE id = ?`,
	);

	const updateEventCount = db.prepare(
		'UPDATE session SET event_count = event_count + ? WHERE id = ?',
	);

	function recordRuntimeEvent(event: RuntimeEvent): void {
		runtimeSeq++;
		insertRuntimeEvent.run(
			event.id,
			runtimeSeq,
			event.timestamp,
			event.hookName,
			event.sessionId,
			JSON.stringify(event),
		);

		// Track adapter session
		if (event.sessionId && !knownAdapterSessions.has(event.sessionId)) {
			knownAdapterSessions.add(event.sessionId);
			insertAdapterSession.run(event.sessionId, event.timestamp);
		}

		// Update session timestamp
		updateSessionTimestamp.run(event.timestamp, opts.sessionId);
	}

	const recordEventAtomic = db.transaction(
		(event: RuntimeEvent, feedEvents: FeedEvent[]) => {
			recordRuntimeEvent(event);
			for (const fe of feedEvents) {
				insertFeedEvent.run(
					fe.event_id,
					event.id,
					fe.seq,
					fe.kind,
					fe.run_id,
					fe.actor_id,
					fe.ts,
					JSON.stringify(fe),
				);
			}
			updateEventCount.run(feedEvents.length, opts.sessionId);
		},
	);

	function recordEvent(event: RuntimeEvent, feedEvents: FeedEvent[]): void {
		recordEventAtomic(event, feedEvents);
	}

	const recordFeedEventsAtomic = db.transaction(
		(feedEvents: FeedEvent[]) => {
			for (const fe of feedEvents) {
				insertFeedEvent.run(
					fe.event_id,
					null,
					fe.seq,
					fe.kind,
					fe.run_id,
					fe.actor_id,
					fe.ts,
					JSON.stringify(fe),
				);
			}
			updateEventCount.run(feedEvents.length, opts.sessionId);
			updateSessionTimestamp.run(Date.now(), opts.sessionId);
		},
	);

	function recordFeedEvents(feedEvents: FeedEvent[]): void {
		recordFeedEventsAtomic(feedEvents);
	}

	function restore(): StoredSession {
		const sessionRow = db
			.prepare('SELECT * FROM session WHERE id = ?')
			.get(opts.sessionId) as
			| {
					id: string;
					project_dir: string;
					created_at: number;
					updated_at: number;
					label: string | null;
			  }
			| undefined;

		const adapterRows = db
			.prepare('SELECT * FROM adapter_sessions ORDER BY started_at')
			.all() as Array<{
			session_id: string;
			started_at: number;
			ended_at: number | null;
			model: string | null;
			source: string | null;
		}>;

		const feedRows = db
			.prepare('SELECT data FROM feed_events ORDER BY seq')
			.all() as Array<{data: string}>;

		const adapterSessionIds = adapterRows.map(r => r.session_id);

		const session: AthenaSession = sessionRow
			? {
					id: sessionRow.id,
					projectDir: sessionRow.project_dir,
					createdAt: sessionRow.created_at,
					updatedAt: sessionRow.updated_at,
					label: sessionRow.label ?? undefined,
					adapterSessionIds,
				}
			: {
					id: opts.sessionId,
					projectDir: opts.projectDir,
					createdAt: now,
					updatedAt: now,
					adapterSessionIds,
				};

		const adapterSessions: AdapterSessionRecord[] = adapterRows.map(r => ({
			sessionId: r.session_id,
			startedAt: r.started_at,
			endedAt: r.ended_at ?? undefined,
			model: r.model ?? undefined,
			source: r.source ?? undefined,
		}));

		const feedEvents: FeedEvent[] = feedRows.map(
			r => JSON.parse(r.data) as FeedEvent,
		);

		return {session, feedEvents, adapterSessions};
	}

	function getAthenaSession(): AthenaSession {
		const sessionRow = db
			.prepare('SELECT * FROM session WHERE id = ?')
			.get(opts.sessionId) as
			| {
					id: string;
					project_dir: string;
					created_at: number;
					updated_at: number;
					label: string | null;
					event_count: number | null;
			  }
			| undefined;

		const adapterRows = db
			.prepare('SELECT session_id FROM adapter_sessions ORDER BY started_at')
			.all() as {session_id: string}[];

		if (!sessionRow) {
			return {
				id: opts.sessionId,
				projectDir: opts.projectDir,
				createdAt: now,
				updatedAt: now,
				adapterSessionIds: adapterRows.map(r => r.session_id),
			};
		}

		return {
			id: sessionRow.id,
			projectDir: sessionRow.project_dir,
			createdAt: sessionRow.created_at,
			updatedAt: sessionRow.updated_at,
			label: sessionRow.label ?? undefined,
			eventCount: sessionRow.event_count ?? 0,
			adapterSessionIds: adapterRows.map(r => r.session_id),
		};
	}

	function updateLabel(label: string): void {
		db.prepare('UPDATE session SET label = ? WHERE id = ?').run(
			label,
			opts.sessionId,
		);
	}

	function close(): void {
		db.close();
	}

	return {
		recordEvent,
		recordFeedEvents,
		restore,
		getAthenaSession,
		updateLabel,
		close,
	};
}
