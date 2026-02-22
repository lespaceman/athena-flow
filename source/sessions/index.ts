// Types
export type {
	AthenaSession,
	AdapterSessionRecord,
	StoredSession,
} from './types.js';
export type {SessionStore} from './store.js';

// Factories
export {createSessionStore} from './store.js';

// Registry
export {
	listSessions,
	getSessionMeta,
	removeSession,
	findSessionByAdapterId,
	getMostRecentAthenaSession,
	sessionsDir,
} from './registry.js';

// Schema (for advanced usage / migrations)
export {SCHEMA_VERSION} from './schema.js';
