import React, {useEffect, useMemo} from 'react';
import {
	createContext,
	useContext,
	useContextSelector,
} from 'use-context-selector';
import path from 'node:path';
import {useFeed} from '../../hooks/useFeed';
import {createClaudeHookRuntime} from '../../harnesses/claude/runtime/index';
import {createSessionStore} from '../../infra/sessions/store';
import {sessionsDir} from '../../infra/sessions/registry';
import {
	type HookContextValue,
	type HookProviderProps,
} from './types';

const HookContext = createContext<HookContextValue | null>(null);
const EMPTY_MESSAGES: never[] = [];
const MISSING_CONTEXT = Symbol('missing-hook-context');

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

	const hookServer = useFeed(
		runtime,
		EMPTY_MESSAGES,
		allowedTools,
		sessionStore,
	);

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

export function useHookContextSelector<T>(
	selector: (value: HookContextValue) => T,
): T {
	const selected = useContextSelector(HookContext, value =>
		value === null ? MISSING_CONTEXT : selector(value),
	);
	if (selected === MISSING_CONTEXT) {
		throw new Error(
			'useHookContextSelector must be used within a HookProvider',
		);
	}
	return selected as T;
}

// Optional hook that doesn't throw if used outside provider
export function useOptionalHookContext(): HookContextValue | null {
	return useContext(HookContext);
}
