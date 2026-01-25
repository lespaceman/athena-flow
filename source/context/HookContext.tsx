import React, {createContext, useContext} from 'react';
import {useHookServer} from '../hooks/useHookServer.js';
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
	const hookServer = useHookServer(projectDir, instanceId);

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
