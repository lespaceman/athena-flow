/**
 * React context types.
 *
 * Types for React context providers in the application.
 */

import {type ReactNode} from 'react';
import {type UseFeedResult} from '../hooks/useFeed';

/**
 * Value provided by the HookContext.
 */
export type HookContextValue = UseFeedResult;

/**
 * Props for the HookProvider component.
 */
export type HookProviderProps = {
	projectDir: string;
	instanceId: number;
	allowedTools?: string[];
	athenaSessionId: string;
	children: ReactNode;
};
