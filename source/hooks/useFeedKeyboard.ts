import {useInput} from 'ink';
import {type TimelineEntry} from '../feed/timeline.js';

export type FeedKeyboardCallbacks = {
	moveFeedCursor: (delta: number) => void;
	jumpToTail: () => void;
	jumpToTop: () => void;
	toggleExpandedAtCursor: () => void;
	scrollDetail: (delta: number, maxDetailScroll: number) => void;
	cycleFocus: () => void;
	setFocusMode: (mode: 'feed' | 'input' | 'todo') => void;
	setInputMode: (mode: 'normal' | 'cmd' | 'search') => void;
	setInputValue: (value: string) => void;
	setExpandedId: (id: string | null) => void;
	setShowRunOverlay: (show: boolean) => void;
	setSearchQuery: (query: string) => void;
	setSearchMatchPos: React.Dispatch<React.SetStateAction<number>>;
	setFeedCursor: (cursor: number) => void;
	setTailFollow: (follow: boolean) => void;
	setDetailScroll: (scroll: number) => void;
};

export type FeedKeyboardOptions = {
	isActive: boolean;
	expandedEntry: TimelineEntry | null;
	expandedId: string | null;
	pageStep: number;
	detailPageStep: number;
	maxDetailScroll: number;
	searchMatches: number[];
	callbacks: FeedKeyboardCallbacks;
};

export function useFeedKeyboard({
	isActive,
	expandedEntry,
	expandedId,
	pageStep,
	detailPageStep,
	maxDetailScroll,
	searchMatches,
	callbacks,
}: FeedKeyboardOptions): void {
	useInput(
		(input, key) => {
			// Ctrl+T: toggle todo panel (handled globally, not here)

			// Escape
			if (key.escape) {
				if (expandedId) {
					callbacks.setExpandedId(null);
					return;
				}
				callbacks.setShowRunOverlay(false);
				return;
			}

			// Detail view mode
			if (expandedEntry) {
				if (key.return || input === 'q' || input === 'Q') {
					callbacks.setExpandedId(null);
					return;
				}
				if (key.home) {
					callbacks.setDetailScroll(0);
					return;
				}
				if (key.end) {
					callbacks.setDetailScroll(maxDetailScroll);
					return;
				}
				if (key.pageUp) {
					callbacks.scrollDetail(-detailPageStep, maxDetailScroll);
					return;
				}
				if (key.pageDown) {
					callbacks.scrollDetail(detailPageStep, maxDetailScroll);
					return;
				}
				if (key.upArrow || input === 'k' || input === 'K') {
					callbacks.scrollDetail(-1, maxDetailScroll);
					return;
				}
				if (key.downArrow || input === 'j' || input === 'J') {
					callbacks.scrollDetail(1, maxDetailScroll);
					return;
				}
				return;
			}

			// Feed navigation mode
			if (key.tab) {
				callbacks.cycleFocus();
				return;
			}

			if (input === ':') {
				callbacks.setFocusMode('input');
				callbacks.setInputMode('cmd');
				callbacks.setInputValue(':');
				return;
			}

			if (input === '/') {
				callbacks.setFocusMode('input');
				callbacks.setInputMode('search');
				callbacks.setInputValue('/');
				return;
			}

			if (key.home) {
				callbacks.jumpToTop();
				return;
			}
			if (key.end) {
				callbacks.jumpToTail();
				return;
			}
			if (key.pageUp) {
				callbacks.moveFeedCursor(-pageStep);
				return;
			}
			if (key.pageDown) {
				callbacks.moveFeedCursor(pageStep);
				return;
			}
			if (key.upArrow) {
				callbacks.moveFeedCursor(-1);
				return;
			}
			if (key.downArrow) {
				callbacks.moveFeedCursor(1);
				return;
			}

			if (key.return || (key.ctrl && key.rightArrow)) {
				callbacks.toggleExpandedAtCursor();
				return;
			}

			if ((input === 'n' || input === 'N') && searchMatches.length > 0) {
				const direction = input === 'n' ? 1 : -1;
				callbacks.setSearchMatchPos(prev => {
					const count = searchMatches.length;
					const next = (prev + direction + count) % count;
					const target = searchMatches[next]!;
					callbacks.setFeedCursor(target);
					callbacks.setTailFollow(false);
					return next;
				});
				return;
			}

			if (key.ctrl && input === 'l') {
				callbacks.setSearchQuery('');
				callbacks.setShowRunOverlay(false);
				callbacks.jumpToTail();
				return;
			}
		},
		{isActive},
	);
}
