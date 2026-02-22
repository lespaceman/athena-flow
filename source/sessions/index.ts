// Types
export type {
	AthenaSession,
	AdapterSessionRecord,
	StoredSession,
} from './types.js';
export type {SessionStore, SessionStoreOptions} from './store.js';

// Factories
export {createSessionStore} from './store.js';

// Registry
export {
	listSessions,
	getSessionMeta,
	removeSession,
	getMostRecentAthenaSession,
	sessionsDir,
} from './registry.js';

// Schema (for advanced usage / migrations)
export {SCHEMA_VERSION} from './schema.js';
