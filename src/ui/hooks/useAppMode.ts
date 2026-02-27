import type {AppMode} from '../../types/headerMetrics';

/**
 * Derive the current app mode from runtime state.
 * Priority: permission > question > working > idle.
 *
 * Named as a hook by convention (called in component render path),
 * but is a pure derivation with no React state or effects.
 */
export function useAppMode(
	isClaudeRunning: boolean,
	currentPermissionRequest: unknown | null,
	currentQuestionRequest: unknown | null,
): AppMode {
	if (!isClaudeRunning) return {type: 'idle'};
	if (currentPermissionRequest) return {type: 'permission'};
	if (currentQuestionRequest) return {type: 'question'};
	return {type: 'working'};
}
