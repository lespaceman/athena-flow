/**
 * React context types.
 *
 * Types for React context providers in the application.
 */

import {type ReactNode} from 'react';
import {type UseRuntimeResult} from '../hooks/useRuntime.js';

/**
 * Value provided by the HookContext.
 */
export type HookContextValue = UseRuntimeResult;

/**
 * Props for the HookProvider component.
 */
export type HookProviderProps = {
	projectDir: string;
	instanceId: number;
	children: ReactNode;
};
