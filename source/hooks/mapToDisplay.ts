/**
 * Thin mapper: RuntimeEvent → HookEventDisplay.
 *
 * This is the temporary bridge between the runtime boundary and existing
 * UI components. Once the feed model is introduced, this can be retired.
 */

import type {RuntimeEvent} from '../runtime/types.js';
import type {HookEventDisplay} from '../types/hooks/display.js';

export function mapToDisplay(event: RuntimeEvent): HookEventDisplay {
	return {
		id: event.id,
		event_id: event.id,
		timestamp: new Date(event.timestamp),
		hookName: event.hookName as HookEventDisplay['hookName'],
		toolName: event.toolName,
		toolUseId: event.toolUseId,
		payload: event.payload as HookEventDisplay['payload'],
		status: 'pending',
	};
}
