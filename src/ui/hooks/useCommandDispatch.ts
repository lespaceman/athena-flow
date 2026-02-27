import {useCallback} from 'react';
import {parseCommand} from './useCommandMode';
import {type UseFeedNavigationResult} from './useFeedNavigation';
import {type UseTodoPanelResult} from './useTodoPanel';
import {type TimelineEntry, type RunSummary} from '../../feed/timeline';
import {formatRunLabel} from '../../utils/format';

export type UseCommandDispatchOptions = {
	addMessage: (role: 'user' | 'assistant', content: string) => void;
	todoPanel: UseTodoPanelResult;
	feedNav: UseFeedNavigationResult;
	setFocusMode: (mode: 'feed' | 'input' | 'todo') => void;
	setShowRunOverlay: React.Dispatch<React.SetStateAction<boolean>>;
	setRunFilter: React.Dispatch<React.SetStateAction<string>>;
	setErrorsOnly: React.Dispatch<React.SetStateAction<boolean>>;
	filteredEntriesRef: React.RefObject<TimelineEntry[]>;
	runSummariesRef: React.RefObject<RunSummary[]>;
};

export function useCommandDispatch({
	addMessage,
	todoPanel,
	feedNav,
	setFocusMode,
	setShowRunOverlay,
	setRunFilter,
	setErrorsOnly,
	filteredEntriesRef,
	runSummariesRef,
}: UseCommandDispatchOptions) {
	return useCallback(
		(commandLine: string) => {
			const action = parseCommand(commandLine);
			switch (action.type) {
				case 'toggle-todo':
					todoPanel.setTodoVisible(v => !v);
					return;
				case 'toggle-todo-done':
					todoPanel.setTodoShowDone(v => !v);
					return;
				case 'focus-todo':
					todoPanel.setTodoVisible(true);
					setFocusMode('todo');
					return;
				case 'add-todo':
					todoPanel.addTodo(action.priority, action.text);
					return;
				case 'show-run-overlay':
					setShowRunOverlay(true);
					return;
				case 'filter-all-runs':
					setRunFilter('all');
					setShowRunOverlay(false);
					feedNav.setTailFollow(true);
					feedNav.setFeedCursor(
						Math.max(0, filteredEntriesRef.current.length - 1),
					);
					return;
				case 'filter-run': {
					const hit = runSummariesRef.current.find(
						s =>
							s.runId.toLowerCase() === action.needle ||
							formatRunLabel(s.runId).toLowerCase() === action.needle,
					);
					if (!hit) {
						addMessage('assistant', `No run matched "${action.needle}"`);
						return;
					}
					setRunFilter(hit.runId);
					setShowRunOverlay(false);
					feedNav.setTailFollow(true);
					feedNav.setFeedCursor(
						Math.max(0, filteredEntriesRef.current.length - 1),
					);
					return;
				}
				case 'jump-to-tail':
					feedNav.setTailFollow(true);
					feedNav.setFeedCursor(
						Math.max(0, filteredEntriesRef.current.length - 1),
					);
					return;
				case 'jump-to-event': {
					const idx = filteredEntriesRef.current.findIndex(e => {
						const id = e.id.toLowerCase();
						return id === action.needle || id.endsWith(action.needle);
					});
					if (idx < 0) {
						addMessage('assistant', `No event matched "${action.needle}"`);
						return;
					}
					feedNav.setFeedCursor(idx);
					feedNav.setTailFollow(false);
					setFocusMode('feed');
					return;
				}
				case 'toggle-errors':
					setErrorsOnly(v => !v);
					feedNav.setTailFollow(true);
					feedNav.setFeedCursor(
						Math.max(0, filteredEntriesRef.current.length - 1),
					);
					return;
				case 'unknown':
					addMessage('assistant', `Unknown command: ${action.command}`);
					return;
			}
		},
		[
			addMessage,
			todoPanel,
			feedNav,
			setFocusMode,
			setShowRunOverlay,
			setRunFilter,
			setErrorsOnly,
			filteredEntriesRef,
			runSummariesRef,
		],
	);
}
