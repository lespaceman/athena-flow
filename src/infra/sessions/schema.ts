import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 6;

export function initSchema(db: Database.Database): void {
	db.exec('PRAGMA journal_mode = WAL');
	db.exec('PRAGMA foreign_keys = ON');

	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_version (
			version INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS session (
			id TEXT PRIMARY KEY,
			project_dir TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			label TEXT,
			event_count INTEGER DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS runtime_events (
			id TEXT PRIMARY KEY,
			seq INTEGER NOT NULL UNIQUE,
			timestamp INTEGER NOT NULL,
			hook_name TEXT NOT NULL,
			adapter_session_id TEXT,
			payload JSON NOT NULL
		);

		CREATE TABLE IF NOT EXISTS feed_events (
			event_id TEXT PRIMARY KEY,
			runtime_event_id TEXT,
			seq INTEGER NOT NULL,
			kind TEXT NOT NULL,
			run_id TEXT NOT NULL,
			actor_id TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			data JSON NOT NULL,
			FOREIGN KEY (runtime_event_id) REFERENCES runtime_events(id)
		);

		CREATE TABLE IF NOT EXISTS adapter_sessions (
			session_id TEXT PRIMARY KEY,
			started_at INTEGER NOT NULL,
			ended_at INTEGER,
			model TEXT,
			source TEXT,
			tokens_input INTEGER,
			tokens_output INTEGER,
			tokens_cache_read INTEGER,
			tokens_cache_write INTEGER,
			tokens_context_size INTEGER,
			tokens_context_window_size INTEGER,
			run_id TEXT REFERENCES workflow_runs(id)
		);

		CREATE TABLE IF NOT EXISTS workflow_runs (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			workflow_name TEXT,
			started_at INTEGER NOT NULL,
			ended_at INTEGER,
			iteration INTEGER NOT NULL DEFAULT 0,
			max_iterations INTEGER NOT NULL DEFAULT 1,
			status TEXT NOT NULL DEFAULT 'running',
			stop_reason TEXT,
			tracker_path TEXT,
			FOREIGN KEY (session_id) REFERENCES session(id)
		);

		-- Channel I/O ledger: every inbound chat normalized by an adapter and every
		-- outbound chat dispatched back to a provider gets one row. Idempotency
		-- key prevents double-delivery on retry/restart; session_id ties chat to a
		-- particular Athena interactive runtime when known.
		CREATE TABLE IF NOT EXISTS channel_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			channel_id TEXT NOT NULL,
			account_id TEXT NOT NULL,
			peer_id TEXT,
			room_id TEXT,
			thread_id TEXT,
			provider_message_id TEXT NOT NULL,
			direction TEXT NOT NULL CHECK(direction IN ('in','out')),
			session_id TEXT REFERENCES adapter_sessions(session_id),
			agent_id TEXT,
			idempotency_key TEXT,
			feed_event_id TEXT,
			created_at INTEGER NOT NULL
		);

		-- Audit log for cloud function invocations brokered by the gateway. One
		-- row per invocation across all callers (agent tool, /run channel cmd,
		-- hook helper). Idempotency cache is in-memory + write-through here.
		CREATE TABLE IF NOT EXISTS gateway_function_invocations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			caller_kind TEXT NOT NULL CHECK(caller_kind IN ('agent','channel','hook')),
			session_id TEXT REFERENCES adapter_sessions(session_id),
			agent_id TEXT,
			idempotency_key TEXT,
			request_hash TEXT NOT NULL,
			status TEXT NOT NULL CHECK(status IN ('pending','ok','error','timeout')),
			http_status INTEGER,
			duration_ms INTEGER,
			error TEXT,
			started_at INTEGER NOT NULL,
			completed_at INTEGER
		);

		-- Durable retry queue for outbound channel sends. Drained by the gateway
		-- daemon on startup and after transient send failures.
		CREATE TABLE IF NOT EXISTS channel_outbox (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			channel_id TEXT NOT NULL,
			account_id TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			attempt INTEGER NOT NULL DEFAULT 0,
			next_attempt_at INTEGER NOT NULL,
			last_error TEXT,
			created_at INTEGER NOT NULL
		);
	`);

	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_feed_kind ON feed_events(kind);
		CREATE INDEX IF NOT EXISTS idx_feed_run ON feed_events(run_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_seq ON feed_events(seq);
		CREATE INDEX IF NOT EXISTS idx_runtime_seq ON runtime_events(seq);
		CREATE INDEX IF NOT EXISTS idx_workflow_runs_session ON workflow_runs(session_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_messages_idem
			ON channel_messages(channel_id, account_id, idempotency_key)
			WHERE idempotency_key IS NOT NULL;
		CREATE INDEX IF NOT EXISTS idx_channel_messages_session_key
			ON channel_messages(channel_id, account_id, peer_id, room_id, thread_id, created_at);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_fn_idem
			ON gateway_function_invocations(name, idempotency_key)
			WHERE idempotency_key IS NOT NULL;
		CREATE INDEX IF NOT EXISTS idx_outbox_due ON channel_outbox(next_attempt_at);
	`);

	// Check schema version
	const existing = db.prepare('SELECT version FROM schema_version').get() as
		| {version: number}
		| undefined;

	if (existing && existing.version > SCHEMA_VERSION) {
		throw new Error(
			`Database has newer schema version ${existing.version} (expected <= ${SCHEMA_VERSION}). ` +
				`Update athena-cli to open this session.`,
		);
	}

	if (!existing) {
		db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(
			SCHEMA_VERSION,
		);
	} else if (existing.version < SCHEMA_VERSION) {
		if (existing.version < 2) {
			// v1 was never shipped. Reject incompatible dev DBs rather than
			// maintaining migration complexity for data no real user has.
			throw new Error(
				`Session database is at schema version ${existing.version} which predates the first release. ` +
					`Delete the session database and start fresh.`,
			);
		}
		if (existing.version === 2) {
			db.exec(`
				ALTER TABLE adapter_sessions ADD COLUMN tokens_input INTEGER;
				ALTER TABLE adapter_sessions ADD COLUMN tokens_output INTEGER;
				ALTER TABLE adapter_sessions ADD COLUMN tokens_cache_read INTEGER;
				ALTER TABLE adapter_sessions ADD COLUMN tokens_cache_write INTEGER;
				ALTER TABLE adapter_sessions ADD COLUMN tokens_context_size INTEGER;
				ALTER TABLE adapter_sessions ADD COLUMN tokens_context_window_size INTEGER;
				UPDATE schema_version SET version = 4;
			`);
		}
		if (existing.version === 3) {
			db.exec(`
				ALTER TABLE adapter_sessions ADD COLUMN tokens_context_window_size INTEGER;
				UPDATE schema_version SET version = 4;
			`);
		}

		// Re-read version after prior migrations
		const currentVersion = (
			db.prepare('SELECT version FROM schema_version').get() as {
				version: number;
			}
		).version;
		if (currentVersion === 4) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS workflow_runs (
					id TEXT PRIMARY KEY,
					session_id TEXT NOT NULL,
					workflow_name TEXT,
					started_at INTEGER NOT NULL,
					ended_at INTEGER,
					iteration INTEGER NOT NULL DEFAULT 0,
					max_iterations INTEGER NOT NULL DEFAULT 1,
					status TEXT NOT NULL DEFAULT 'running',
					stop_reason TEXT,
					tracker_path TEXT,
					FOREIGN KEY (session_id) REFERENCES session(id)
				);
				CREATE INDEX IF NOT EXISTS idx_workflow_runs_session ON workflow_runs(session_id);
				ALTER TABLE adapter_sessions ADD COLUMN run_id TEXT REFERENCES workflow_runs(id);
				UPDATE schema_version SET version = 5;
			`);
		}

		const versionAfterV5 = (
			db.prepare('SELECT version FROM schema_version').get() as {
				version: number;
			}
		).version;
		if (versionAfterV5 === 5) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS channel_messages (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					channel_id TEXT NOT NULL,
					account_id TEXT NOT NULL,
					peer_id TEXT,
					room_id TEXT,
					thread_id TEXT,
					provider_message_id TEXT NOT NULL,
					direction TEXT NOT NULL CHECK(direction IN ('in','out')),
					session_id TEXT REFERENCES adapter_sessions(session_id),
					agent_id TEXT,
					idempotency_key TEXT,
					feed_event_id TEXT,
					created_at INTEGER NOT NULL
				);
				CREATE TABLE IF NOT EXISTS gateway_function_invocations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL,
					caller_kind TEXT NOT NULL CHECK(caller_kind IN ('agent','channel','hook')),
					session_id TEXT REFERENCES adapter_sessions(session_id),
					agent_id TEXT,
					idempotency_key TEXT,
					request_hash TEXT NOT NULL,
					status TEXT NOT NULL CHECK(status IN ('pending','ok','error','timeout')),
					http_status INTEGER,
					duration_ms INTEGER,
					error TEXT,
					started_at INTEGER NOT NULL,
					completed_at INTEGER
				);
				CREATE TABLE IF NOT EXISTS channel_outbox (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					channel_id TEXT NOT NULL,
					account_id TEXT NOT NULL,
					payload_json TEXT NOT NULL,
					attempt INTEGER NOT NULL DEFAULT 0,
					next_attempt_at INTEGER NOT NULL,
					last_error TEXT,
					created_at INTEGER NOT NULL
				);
				CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_messages_idem
					ON channel_messages(channel_id, account_id, idempotency_key)
					WHERE idempotency_key IS NOT NULL;
				CREATE INDEX IF NOT EXISTS idx_channel_messages_session_key
					ON channel_messages(channel_id, account_id, peer_id, room_id, thread_id, created_at);
				CREATE UNIQUE INDEX IF NOT EXISTS idx_fn_idem
					ON gateway_function_invocations(name, idempotency_key)
					WHERE idempotency_key IS NOT NULL;
				CREATE INDEX IF NOT EXISTS idx_outbox_due ON channel_outbox(next_attempt_at);
				UPDATE schema_version SET version = 6;
			`);
		}
	}
}
