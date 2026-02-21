import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {
	type TodoPanelItem,
	type TodoPanelStatus,
	toTodoStatus,
} from '../feed/todoPanel.js';
import {type TodoItem} from '../types/todo.js';
import {toAscii} from '../utils/format.js';
import {generateId} from '../types/index.js';

export type UseTodoPanelOptions = {
	tasks: TodoItem[];
	todoVisible: boolean;
	focusMode: string;
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
	const [todoShowDone, setTodoShowDone] = useState(false);
	const [todoCursor, setTodoCursor] = useState(0);
	const [todoScroll, setTodoScroll] = useState(0);
	const [extraTodos, setExtraTodos] = useState<TodoPanelItem[]>([]);
	const [todoStatusOverrides, setTodoStatusOverrides] = useState<
		Record<string, TodoPanelStatus>
	>({});

	const todoItems = useMemo((): TodoPanelItem[] => {
		const fromTasks = tasks.map((task, index) => ({
			id: `task-${index}-${toAscii(task.content).slice(0, 16)}`,
			text: task.content,
			priority: 'P1' as const,
			status: toTodoStatus(task.status),
			owner: 'main',
		}));
		const merged = [...fromTasks, ...extraTodos].map(todo => ({
			...todo,
			status: todoStatusOverrides[todo.id] ?? todo.status,
		}));
		return merged;
	}, [tasks, extraTodos, todoStatusOverrides]);

	const visibleTodoItems = useMemo(
		() =>
			todoShowDone
				? todoItems
				: todoItems.filter(todo => todo.status !== 'done'),
		[todoItems, todoShowDone],
	);

	const sortedItems = useMemo(() => {
		const statusOrder: Record<TodoPanelStatus, number> = {
			doing: 0,
			open: 1,
			blocked: 1,
			done: 2,
		};
		return [...visibleTodoItems].sort(
			(a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1),
		);
	}, [visibleTodoItems]);

	const visibleTodoItemsRef = useRef(sortedItems);
	visibleTodoItemsRef.current = sortedItems;

	const doneCount = todoItems.filter(todo => todo.status === 'done').length;
	const doingCount = todoItems.filter(todo => todo.status === 'doing').length;
	const blockedCount = todoItems.filter(
		todo => todo.status === 'blocked',
	).length;
	const openCount = todoItems.filter(todo => todo.status === 'open').length;
	const remainingCount = todoItems.filter(
		todo => todo.status !== 'done',
	).length;

	// Clamp cursor when items shrink
	useEffect(() => {
		setTodoCursor(prev => Math.min(prev, Math.max(0, sortedItems.length - 1)));
	}, [sortedItems.length]);

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
		if (!selected) return;
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
