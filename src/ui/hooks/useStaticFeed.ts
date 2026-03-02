import {useRef} from 'react';
import {type TimelineEntry} from '../../core/feed/timeline';
import {isEntryStable} from '../../core/feed/timeline';

export type UseStaticFeedOptions = {
	filteredEntries: TimelineEntry[];
	feedViewportStart: number;
	tailFollow: boolean;
};

/**
 * Tracks a monotonic high-water mark — the index into `filteredEntries`
 * up to which entries have been emitted to `<Static>`.
 *
 * Uses `useRef` (not `useState`) to avoid triggering re-renders when
 * the mark advances — advancement is observed on the next natural render.
 */
export function useStaticFeed({
	filteredEntries,
	feedViewportStart,
	tailFollow,
}: UseStaticFeedOptions): number {
	const hwmRef = useRef(0);

	// Only advance when tail-following — don't yank entries the user is viewing
	if (!tailFollow) return hwmRef.current;

	let candidate = hwmRef.current;

	// Advance consecutively while entries are below viewport and stable
	while (candidate < feedViewportStart) {
		const entry = filteredEntries[candidate];
		if (!entry || !isEntryStable(entry)) break;
		candidate++;
	}

	hwmRef.current = candidate;
	return candidate;
}
