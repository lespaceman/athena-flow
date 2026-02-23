import React, {createContext, useContext, useEffect, useMemo} from 'react';
import path from 'node:path';
import {useFeed} from '../hooks/useFeed.js';
import {createClaudeHookRuntime} from '../runtime/adapters/claudeHooks/index.js';
import {createSessionStore} from '../sessions/store.js';
import {sessionsDir} from '../sessions/registry.js';
import {
	type HookContextValue,
	type HookProviderProps,
} from '../types/context.js';

const HookContext = createContext<HookContextValue | null>(null);

export function HookProvider({
	projectDir,
	instanceId,
	allowedTools,
	athenaSessionId,
	children,
}: HookProviderProps) {
	// Runtime must be stable (memoized) — useFeed assumes it doesn't change
	const runtime = useMemo(
		() => createClaudeHookRuntime({projectDir, instanceId}),
		[projectDir, instanceId],
	);

	const sessionStore = useMemo(
		() =>
			createSessionStore({
				sessionId: athenaSessionId,
				projectDir,
				dbPath: path.join(sessionsDir(), athenaSessionId, 'session.db'),
			}),
		[athenaSessionId, projectDir],
	);

	useEffect(() => {
		return () => {
			sessionStore.close();
		};
	}, [sessionStore]);

	const hookServer = useFeed(runtime, [], allowedTools, sessionStore);

	return (
		<HookContext.Provider value={hookServer}>{children}</HookContext.Provider>
	);
}

export function useHookContext(): HookContextValue {
	const context = useContext(HookContext);
	if (!context) {
		throw new Error('useHookContext must be used within a HookProvider');
	}
	return context;
}

// Optional hook that doesn't throw if used outside provider
export function useOptionalHookContext(): HookContextValue | null {
	return useContext(HookContext);
}
