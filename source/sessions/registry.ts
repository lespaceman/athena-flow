import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import type {AthenaSession} from './types.js';
import {SCHEMA_VERSION} from './schema.js';

export function sessionsDir(): string {
	return path.join(os.homedir(), '.config', 'athena', 'sessions');
}

function sessionDbPath(sessionId: string): string {
	return path.join(sessionsDir(), sessionId, 'session.db');
}

function readSessionFromDb(dbPath: string): AthenaSession | null {
	if (!fs.existsSync(dbPath)) return null;

	try {
		const db = new Database(dbPath, {readonly: true});

		// Bail if schema version is newer than supported
		const versionRow = db
			.prepare('SELECT version FROM schema_version')
			.get() as {version: number} | undefined;
		if (versionRow && versionRow.version > SCHEMA_VERSION) {
			db.close();
			return null;
		}

		const row = db.prepare('SELECT * FROM session LIMIT 1').get() as
			| {
					id: string;
					project_dir: string;
					created_at: number;
					updated_at: number;
					label: string | null;
			  }
			| undefined;

		const adapters = db
			.prepare('SELECT session_id FROM adapter_sessions ORDER BY started_at')
			.all() as {session_id: string}[];

		db.close();

		if (!row) return null;

		return {
			id: row.id,
			projectDir: row.project_dir,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			label: row.label ?? undefined,
			adapterSessionIds: adapters.map(a => a.session_id),
		};
	} catch {
		return null;
	}
}

export function listSessions(projectDir?: string): AthenaSession[] {
	const dir = sessionsDir();
	if (!fs.existsSync(dir)) return [];

	const entries = fs.readdirSync(dir, {withFileTypes: true});
	const sessions: AthenaSession[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const dbPath = path.join(dir, entry.name, 'session.db');
		const session = readSessionFromDb(dbPath);
		if (session) {
			if (!projectDir || session.projectDir === projectDir) {
				sessions.push(session);
			}
		}
	}

	return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSessionMeta(sessionId: string): AthenaSession | null {
	return readSessionFromDb(sessionDbPath(sessionId));
}

export function removeSession(sessionId: string): void {
	const dir = path.join(sessionsDir(), sessionId);
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, {recursive: true, force: true});
	}
}

export function getMostRecentAthenaSession(
	projectDir: string,
): AthenaSession | null {
	const sessions = listSessions(projectDir);
	return sessions[0] ?? null;
}
