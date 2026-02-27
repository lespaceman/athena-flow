import type {ClaudeState} from '../../../shared/types/headerMetrics';
import {type Theme} from '../../theme/index';

export function getStateColors(theme: Theme): Record<ClaudeState, string> {
	return {
		idle: theme.status.neutral,
		working: theme.status.working,
		waiting: theme.status.warning,
		error: theme.status.error,
	};
}

export const STATE_LABELS: Record<ClaudeState, string> = {
	idle: 'idle',
	working: 'working',
	waiting: 'waiting for input',
	error: 'error',
};

export const LOGO_LINES = [' ▄██████▄ ', ' █ ◂  ▸ █ ', ' ▀██████▀ '];

export const TIPS = [
	'Type a prompt to start a session',
	'Use /help for available commands',
	'Press Ctrl+E for session stats',
];
