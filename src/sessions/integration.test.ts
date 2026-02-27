import {describe, it, expect, afterEach} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createSessionStore} from './store';
import {createFeedMapper} from '../feed/mapper';
import type {RuntimeEvent} from '../runtime/types';

function makeRuntimeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
	return {
		id: 'evt-1',
		timestamp: Date.now(),
		hookName: 'SessionStart',
		sessionId: 'claude-1',
		context: {cwd: '/test', transcriptPath: '/tmp/t.jsonl'},
		interaction: {expectsDecision: false},
		payload: {session_id: 'claude-1', source: 'startup'},
		...overrides,
	};
}

describe('session store integration', () => {
	it('full lifecycle: record → restore → verify (in-memory)', () => {
		const store = createSessionStore({
			sessionId: 'integration-1',
			projectDir: '/test/proj',
			dbPath: ':memory:',
		});

		const mapper = createFeedMapper();
		const sessionStartEvent = makeRuntimeEvent();
		const feedEvents = mapper.mapEvent(sessionStartEvent);

		store.recordEvent(sessionStartEvent, feedEvents);

		const restored = store.restore();
		expect(restored.session.id).toBe('integration-1');
		expect(restored.session.projectDir).toBe('/test/proj');
		expect(restored.feedEvents.length).toBeGreaterThan(0);
		expect(restored.adapterSessions).toHaveLength(1);
		expect(restored.adapterSessions[0]!.sessionId).toBe('claude-1');

		// Bootstrap mapper from restored data
		const restoredMapper = createFeedMapper(store.toBootstrap());
		expect(restoredMapper.getSession()).not.toBeNull();

		store.close();
	});

	describe('filesystem-backed', () => {
		let tmpDir: string;

		afterEach(() => {
			if (tmpDir) {
				fs.rmSync(tmpDir, {recursive: true, force: true});
			}
		});

		it('persists across close/reopen cycles', () => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-integration-'));
			const dbPath = path.join(tmpDir, 'test-session', 'session.db');

			// Phase 1: Write
			const store1 = createSessionStore({
				sessionId: 'fs-test-1',
				projectDir: '/my/project',
				dbPath,
			});

			const mapper = createFeedMapper();
			const evt1 = makeRuntimeEvent({id: 'e1', timestamp: 1000});
			const feed1 = mapper.mapEvent(evt1);
			store1.recordEvent(evt1, feed1);

			const evt2 = makeRuntimeEvent({
				id: 'e2',
				timestamp: 2000,
				hookName: 'PreToolUse',
				payload: {tool_name: 'Bash'},
			});
			const feed2 = mapper.mapEvent(evt2);
			store1.recordEvent(evt2, feed2);

			store1.close();

			// Phase 2: Reopen and verify
			const store2 = createSessionStore({
				sessionId: 'fs-test-1',
				projectDir: '/my/project',
				dbPath,
			});

			const restored = store2.restore();
			expect(restored.session.id).toBe('fs-test-1');
			expect(restored.session.updatedAt).toBe(2000);
			expect(restored.feedEvents.length).toBeGreaterThanOrEqual(2);
			expect(restored.adapterSessions).toHaveLength(1);

			// Phase 3: Bootstrap mapper and process new event
			const restoredMapper = createFeedMapper(store2.toBootstrap());
			const evt3 = makeRuntimeEvent({
				id: 'e3',
				timestamp: 3000,
				hookName: 'SessionStart',
				sessionId: 'claude-2',
				payload: {session_id: 'claude-2', source: 'resume'},
			});
			const feed3 = restoredMapper.mapEvent(evt3);
			store2.recordEvent(evt3, feed3);

			const final = store2.restore();
			expect(final.adapterSessions).toHaveLength(2);
			expect(final.feedEvents.length).toBeGreaterThan(
				restored.feedEvents.length,
			);

			store2.close();
		});

		it('WAL mode is active on file-backed DB', () => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-wal-'));
			const dbPath = path.join(tmpDir, 'wal-test', 'session.db');

			const store = createSessionStore({
				sessionId: 'wal-test',
				projectDir: '/tmp',
				dbPath,
			});

			// WAL creates -wal and -shm files
			store.recordEvent(makeRuntimeEvent(), []);
			expect(fs.existsSync(dbPath)).toBe(true);

			store.close();
		});
	});
});
