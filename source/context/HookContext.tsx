import React, {createContext, useContext, useMemo} from 'react';
import {useFeed} from '../hooks/useFeed.js';
import {createClaudeHookRuntime} from '../runtime/adapters/claudeHooks/index.js';
import {
	type HookContextValue,
	type HookProviderProps,
} from '../types/context.js';

const HookContext = createContext<HookContextValue | null>(null);

export function HookProvider({
	projectDir,
	instanceId,
	allowedTools,
	children,
}: HookProviderProps) {
	// Runtime must be stable (memoized) — useFeed assumes it doesn't change
	const runtime = useMemo(
		() => createClaudeHookRuntime({projectDir, instanceId}),
		[projectDir, instanceId],
	);
	const hookServer = useFeed(runtime, [], allowedTools);

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
