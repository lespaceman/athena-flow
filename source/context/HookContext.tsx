import React, {createContext, useContext, type ReactNode} from 'react';
import {
	useHookServer,
	type UseHookServerResult,
} from '../hooks/useHookServer.js';

type HookContextValue = UseHookServerResult;

const HookContext = createContext<HookContextValue | null>(null);

type HookProviderProps = {
	projectDir: string;
	instanceId: number;
	children: ReactNode;
};

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
