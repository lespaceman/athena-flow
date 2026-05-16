import type {RuntimeEvent} from '../../runtime/types';
import type {PermissionSuggestion} from '../../../shared/types/permissionSuggestion';
import type {
	FeedEvent,
	FeedEventCause,
	FeedEventKind,
	FeedEventLevel,
} from '../types';
import type {Run} from '../entities';

export type FeedEventBuilder = (
	kind: FeedEventKind,
	level: FeedEventLevel,
	actorId: string,
	data: unknown,
	runtimeEvent: RuntimeEvent,
	cause?: Partial<FeedEventCause>,
) => FeedEvent;

export type EnsureRun = (
	runtimeEvent: RuntimeEvent,
	triggerType?: Run['trigger']['type'],
	promptPreview?: string,
) => FeedEvent[];

export function readString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string') return value;
	}
	return undefined;
}

export function readBoolean(...values: unknown[]): boolean | undefined {
	for (const value of values) {
		if (typeof value === 'boolean') return value;
	}
	return undefined;
}

export function readObject(...values: unknown[]): Record<string, unknown> {
	for (const value of values) {
		if (typeof value === 'object' && value !== null) {
			return value as Record<string, unknown>;
		}
	}
	return {};
}

export function readSuggestionArray(
	...values: unknown[]
): PermissionSuggestion[] | undefined {
	for (const value of values) {
		if (Array.isArray(value)) return value as PermissionSuggestion[];
	}
	return undefined;
}
