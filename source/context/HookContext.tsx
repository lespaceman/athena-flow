import React, {createContext, useContext, useMemo} from 'react';
import {useRuntime} from '../hooks/useRuntime.js';
import {createClaudeHookRuntime} from '../runtime/adapters/claudeHooks/index.js';
import {
	type HookContextValue,
	type HookProviderProps,
} from '../types/context.js';

const HookContext = createContext<HookContextValue | null>(null);

export function HookProvider({
	projectDir,
	instanceId,
	children,
}: HookProviderProps) {
	// Runtime must be stable (memoized) — useRuntime assumes it doesn't change
	const runtime = useMemo(
		() => createClaudeHookRuntime({projectDir, instanceId}),
		[projectDir, instanceId],
	);
	const hookServer = useRuntime(runtime);

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
