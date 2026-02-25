import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {
	type TodoPanelItem,
	type TodoPanelStatus,
	toTodoStatus,
} from '../feed/todoPanel.js';
import {type TodoItem} from '../types/todo.js';

import {generateId} from '../types/index.js';
import {formatElapsed} from '../utils/formatElapsed.js';

export type UseTodoPanelOptions = {
	tasks: TodoItem[];
};

export type UseTodoPanelResult = {
	todoVisible: boolean;
	todoShowDone: boolean;
	todoCursor: number;
	todoScroll: number;
	extraTodos: TodoPanelItem[];
	todoStatusOverrides: Record<string, TodoPanelStatus>;
	todoItems: TodoPanelItem[];
	visibleTodoItems: TodoPanelItem[];
	doneCount: number;
	doingCount: number;
	blockedCount: number;
	openCount: number;
	failedCount: number;
	remainingCount: number;
	setTodoVisible: React.Dispatch<React.SetStateAction<boolean>>;
	setTodoShowDone: React.Dispatch<React.SetStateAction<boolean>>;
	setTodoCursor: React.Dispatch<React.SetStateAction<number>>;
	setTodoScroll: React.Dispatch<React.SetStateAction<number>>;
	setExtraTodos: React.Dispatch<React.SetStateAction<TodoPanelItem[]>>;
	setTodoStatusOverrides: React.Dispatch<
		React.SetStateAction<Record<string, TodoPanelStatus>>
	>;
	addTodo: (priority: 'P0' | 'P1' | 'P2', text: string) => void;
	toggleTodoStatus: (index: number) => void;
};

export function useTodoPanel({tasks}: UseTodoPanelOptions): UseTodoPanelResult {
	const [todoVisible, setTodoVisible] = useState(true);
	const [todoShowDone, setTodoShowDone] = useState(true);
	const [todoCursor, setTodoCursor] = useState(0);
	const [todoScroll, setTodoScroll] = useState(0);
	const [extraTodos, setExtraTodos] = useState<TodoPanelItem[]>([]);
	const [todoStatusOverrides, setTodoStatusOverrides] = useState<
		Record<string, TodoPanelStatus>
	>({});
	const startedAtRef = useRef<Map<string, number>>(new Map());

	const todoItems = useMemo((): TodoPanelItem[] => {
		const fromTasks = tasks.map((task, index) => ({
			id: `task-${index}-${task.content.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`,
			text: task.content,
			priority: 'P1' as const,
			status: toTodoStatus(task.status),
			owner: 'main',
		}));
		const merged = [...fromTasks, ...extraTodos].map(todo => ({
			...todo,
			status: todoStatusOverrides[todo.id] ?? todo.status,
		}));

		// Track start times and compute elapsed
		const now = Date.now();
		const startedAt = startedAtRef.current;
		return merged.map(todo => {
			if (todo.status === 'doing' && !startedAt.has(todo.id)) {
				startedAt.set(todo.id, now);
			}
			let elapsed: string | undefined;
			if (
				(todo.status === 'done' || todo.status === 'failed') &&
				startedAt.has(todo.id)
			) {
				elapsed = formatElapsed(now - startedAt.get(todo.id)!);
			}
			return {...todo, elapsed};
		});
	}, [tasks, extraTodos, todoStatusOverrides]);

	const sortedItems = useMemo(() => {
		return todoShowDone
			? todoItems
			: todoItems.filter(todo => todo.status !== 'done');
	}, [todoItems, todoShowDone]);

	const visibleTodoItemsRef = useRef(sortedItems);
	visibleTodoItemsRef.current = sortedItems;

	const {
		doneCount,
		doingCount,
		blockedCount,
		openCount,
		failedCount,
		remainingCount,
	} = useMemo(() => {
		let done = 0;
		let doing = 0;
		let blocked = 0;
		let open = 0;
		let failed = 0;
		for (const todo of todoItems) {
			switch (todo.status) {
				case 'done':
					done++;
					break;
				case 'doing':
					doing++;
					break;
				case 'blocked':
					blocked++;
					break;
				case 'open':
					open++;
					break;
				case 'failed':
					failed++;
					break;
			}
		}
		return {
			doneCount: done,
			doingCount: doing,
			blockedCount: blocked,
			openCount: open,
			failedCount: failed,
			remainingCount: todoItems.length - done,
		};
	}, [todoItems]);

	// Clamp cursor when items shrink
	useEffect(() => {
		setTodoCursor(prev => Math.min(prev, Math.max(0, sortedItems.length - 1)));
	}, [sortedItems.length]);

	// Auto-scroll to keep active (doing) item visible
	useEffect(() => {
		const activeIdx = sortedItems.findIndex(i => i.status === 'doing');
		if (activeIdx < 0) return;
		setTodoScroll(prev => {
			const maxVisible = 5;
			if (activeIdx < prev) return activeIdx;
			if (activeIdx >= prev + maxVisible)
				return Math.max(0, activeIdx - maxVisible + 1);
			return prev;
		});
	}, [sortedItems]);

	const addTodo = useCallback((priority: 'P0' | 'P1' | 'P2', text: string) => {
		setExtraTodos(prev => [
			...prev,
			{
				id: `local-${generateId()}`,
				text,
				priority,
				status: 'open',
				owner: 'main',
				localOnly: true,
			},
		]);
		setTodoVisible(true);
	}, []);

	const toggleTodoStatus = useCallback((index: number) => {
		const selected = visibleTodoItemsRef.current[index];
		if (!selected || selected.status === 'failed') return;
		setTodoStatusOverrides(prev => ({
			...prev,
			[selected.id]:
				(prev[selected.id] ?? selected.status) === 'done' ? 'open' : 'done',
		}));
	}, []);

	return {
		todoVisible,
		todoShowDone,
		todoCursor,
		todoScroll,
		extraTodos,
		todoStatusOverrides,
		todoItems,
		visibleTodoItems: sortedItems,
		doneCount,
		doingCount,
		blockedCount,
		openCount,
		failedCount,
		remainingCount,
		setTodoVisible,
		setTodoShowDone,
		setTodoCursor,
		setTodoScroll,
		setExtraTodos,
		setTodoStatusOverrides,
		addTodo,
		toggleTodoStatus,
	};
}
