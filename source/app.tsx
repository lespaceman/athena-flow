import process from 'node:process';
import React, {useState, useCallback, useRef, useEffect, useMemo} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import PermissionDialog from './components/PermissionDialog.js';
import QuestionDialog from './components/QuestionDialog.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import {HookProvider, useHookContext} from './context/HookContext.js';
import {useClaudeProcess} from './hooks/useClaudeProcess.js';
import {useHeaderMetrics} from './hooks/useHeaderMetrics.js';
import {useDuration} from './hooks/useDuration.js';
import {useAppMode} from './hooks/useAppMode.js';
import {useTextInput} from './hooks/useTextInput.js';
import {type InputHistory, useInputHistory} from './hooks/useInputHistory.js';
import {
	type Message as MessageType,
	type IsolationConfig,
	generateId,
} from './types/index.js';
import {type FeedItem} from './hooks/useFeed.js';
import {type PermissionDecision} from './types/server.js';
import {parseInput} from './commands/parser.js';
import {executeCommand} from './commands/executor.js';
import {ThemeProvider, useTheme, type Theme} from './theme/index.js';
import SessionPicker from './components/SessionPicker.js';
import {readSessionIndex} from './utils/sessionIndex.js';
import {type FeedEvent} from './feed/types.js';
import {type TodoItem} from './types/todo.js';

type Props = {
	projectDir: string;
	instanceId: number;
	isolation?: IsolationConfig;
	verbose?: boolean;
	version: string;
	pluginMcpConfig?: string;
	modelName: string | null;
	claudeCodeVersion: string | null;
	theme: Theme;
	initialSessionId?: string;
	showSessionPicker?: boolean;
};

type AppPhase =
	| {type: 'session-select'}
	| {type: 'main'; initialSessionId?: string};

type FocusMode = 'feed' | 'input' | 'todo';
type InputMode = 'normal' | 'cmd' | 'search';
type TodoPanelStatus = 'open' | 'doing' | 'blocked' | 'done';
type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

type TimelineEntry = {
	id: string;
	ts: number;
	runId?: string;
	op: string;
	actor: string;
	summary: string;
	searchText: string;
	error: boolean;
	expandable: boolean;
	details: string;
};

type RunSummary = {
	runId: string;
	title: string;
	status: RunStatus;
	startedAt: number;
	endedAt?: number;
};

type TodoPanelItem = {
	id: string;
	text: string;
	priority: 'P0' | 'P1' | 'P2';
	status: TodoPanelStatus;
	linkedEventId?: string;
	owner?: string;
	localOnly?: boolean;
};

const HEADER_ROWS = 2;
const FOOTER_ROWS = 2;
const TODO_PANEL_MAX_ROWS = 6;
const RUN_OVERLAY_MAX_ROWS = 6;
const FEED_OVERSCAN = 2;
const FRAME_BORDER_ROWS = 4;

function toAscii(value: string): string {
	return value.replace(/[^\x20-\x7e]/g, '?');
}

function compactText(value: string, max: number): string {
	const clean = toAscii(value).replace(/\s+/g, ' ').trim();
	if (max <= 0) return '';
	if (clean.length <= max) return clean;
	if (max <= 3) return clean.slice(0, max);
	return `${clean.slice(0, max - 3)}...`;
}

function fit(text: string, width: number): string {
	const clean = toAscii(text);
	if (width <= 0) return '';
	if (clean.length <= width) return clean.padEnd(width, ' ');
	if (width <= 3) return clean.slice(0, width);
	return `${clean.slice(0, width - 3)}...`;
}

function formatClock(timestamp: number): string {
	const d = new Date(timestamp);
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	const ss = String(d.getSeconds()).padStart(2, '0');
	return `${hh}:${mm}:${ss}`;
}

function formatCount(value: number | null): string {
	if (value === null) return '--';
	return value.toLocaleString('en-US');
}

function formatSessionLabel(sessionId: string | undefined): string {
	if (!sessionId) return 'S-';
	const tail = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
	return `S${tail || '-'}`;
}

function formatRunLabel(runId: string | undefined): string {
	if (!runId) return 'R-';
	const direct = runId.match(/^(R\d+)$/i);
	if (direct) return direct[1]!.toUpperCase();
	const tail = runId.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
	return `R${tail || '-'}`;
}

function actorLabel(actorId: string): string {
	if (actorId === 'user') return 'USER';
	if (actorId === 'agent:root') return 'AGENT';
	if (actorId === 'system') return 'SYSTEM';
	if (actorId.startsWith('subagent:')) {
		return `SA-${compactText(actorId.slice('subagent:'.length), 8)}`;
	}
	return compactText(actorId.toUpperCase(), 12);
}

function summarizeValue(value: unknown): string {
	if (typeof value === 'string') return compactText(JSON.stringify(value), 28);
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (value === null || value === undefined) return String(value);
	if (Array.isArray(value)) return `[${value.length}]`;
	if (typeof value === 'object') return '{...}';
	return compactText(String(value), 20);
}

function summarizeToolInput(input: Record<string, unknown>): string {
	const pairs = Object.entries(input)
		.slice(0, 2)
		.map(([key, value]) => `${key}=${summarizeValue(value)}`);
	return pairs.join(' ');
}

function eventOperation(event: FeedEvent): string {
	switch (event.kind) {
		case 'run.start':
			return 'run.start';
		case 'run.end':
			return event.data.status === 'completed'
				? 'run.ok'
				: event.data.status === 'failed'
					? 'run.fail'
					: 'run.abort';
		case 'user.prompt':
			return 'prompt';
		case 'tool.pre':
			return 'tool.call';
		case 'tool.post':
			return 'tool.ok';
		case 'tool.failure':
			return 'tool.fail';
		case 'subagent.start':
			return 'sub.start';
		case 'subagent.stop':
			return 'sub.stop';
		case 'permission.request':
			return 'perm.req';
		case 'permission.decision':
			return `perm.${event.data.decision_type}`;
		case 'stop.request':
			return 'stop.req';
		case 'stop.decision':
			return `stop.${event.data.decision_type}`;
		case 'session.start':
			return 'sess.start';
		case 'session.end':
			return 'sess.end';
		case 'notification':
			return 'notify';
		case 'compact.pre':
			return 'compact';
		case 'setup':
			return 'setup';
		case 'unknown.hook':
			return 'unknown';
		case 'todo.add':
			return 'todo.add';
		case 'todo.update':
			return 'todo.upd';
		case 'todo.done':
			return 'todo.done';
		default:
			return 'event';
	}
}

function eventSummary(event: FeedEvent): string {
	switch (event.kind) {
		case 'run.start':
			return compactText(event.data.trigger.prompt_preview || 'interactive', 84);
		case 'run.end':
			return compactText(
				`status=${event.data.status} tools=${event.data.counters.tool_uses} fail=${event.data.counters.tool_failures} perm=${event.data.counters.permission_requests} blk=${event.data.counters.blocks}`,
				84,
			);
		case 'user.prompt':
			return compactText(event.data.prompt, 84);
		case 'tool.pre': {
			const args = summarizeToolInput(event.data.tool_input);
			return compactText(`${event.data.tool_name} ${args}`.trim(), 84);
		}
		case 'tool.post':
			return compactText(event.data.tool_name, 84);
		case 'tool.failure':
			return compactText(`${event.data.tool_name} ${event.data.error}`, 84);
		case 'subagent.start':
			return compactText(
				`${event.data.agent_type} ${event.data.agent_id}`,
				84,
			);
		case 'subagent.stop':
			return compactText(
				`${event.data.agent_type} ${event.data.agent_id}`,
				84,
			);
		case 'permission.request':
			return compactText(
				`${event.data.tool_name} ${summarizeToolInput(event.data.tool_input)}`.trim(),
				84,
			);
		case 'permission.decision': {
			const detail =
				event.data.decision_type === 'deny'
					? event.data.message || event.data.reason
					: event.data.reason;
			return compactText(detail || event.data.decision_type, 84);
		}
		case 'stop.request':
			return compactText(
				`scope=${event.data.scope}${event.data.agent_id ? ` agent=${event.data.agent_id}` : ''}`,
				84,
			);
		case 'stop.decision':
			return compactText(event.data.reason || event.data.decision_type, 84);
		case 'session.start':
			return compactText(
				`source=${event.data.source}${event.data.model ? ` model=${event.data.model}` : ''}`,
				84,
			);
		case 'session.end':
			return compactText(`reason=${event.data.reason}`, 84);
		case 'notification':
			return compactText(event.data.message, 84);
		case 'compact.pre':
			return compactText(`trigger=${event.data.trigger}`, 84);
		case 'setup':
			return compactText(`trigger=${event.data.trigger}`, 84);
		case 'unknown.hook':
			return compactText(event.data.hook_event_name, 84);
		case 'todo.add':
			return compactText(
				`${event.data.priority?.toUpperCase() ?? 'P1'} ${event.data.text}`,
				84,
			);
		case 'todo.update': {
			const patchFields = Object.keys(event.data.patch);
			return compactText(
				`${event.data.todo_id} ${patchFields.length > 0 ? patchFields.join(',') : 'update'}`,
				84,
			);
		}
		case 'todo.done':
			return compactText(`${event.data.todo_id} ${event.data.reason || 'done'}`, 84);
		default:
			return compactText('event', 84);
	}
}

function expansionForEvent(event: FeedEvent): string {
	switch (event.kind) {
		case 'tool.pre':
			return JSON.stringify(
				{tool: event.data.tool_name, args: event.data.tool_input},
				null,
				2,
			);
		case 'tool.post':
			return JSON.stringify(
				{
					tool: event.data.tool_name,
					args: event.data.tool_input,
					result: event.data.tool_response,
				},
				null,
				2,
			);
		case 'tool.failure':
			return JSON.stringify(
				{
					tool: event.data.tool_name,
					args: event.data.tool_input,
					error: event.data.error,
					interrupt: event.data.is_interrupt,
				},
				null,
				2,
			);
		case 'permission.request':
			return JSON.stringify(
				{
					tool: event.data.tool_name,
					args: event.data.tool_input,
					suggestions: event.data.permission_suggestions,
				},
				null,
				2,
			);
		case 'subagent.stop':
		case 'run.end':
			return JSON.stringify(event.data, null, 2);
		default:
			return JSON.stringify(event.raw ?? event.data, null, 2);
	}
}

function isEventError(event: FeedEvent): boolean {
	if (event.level === 'error') return true;
	if (event.kind === 'tool.failure') return true;
	if (event.kind === 'run.end') return event.data.status !== 'completed';
	if (
		event.kind === 'permission.decision' &&
		event.data.decision_type === 'deny'
	) {
		return true;
	}
	if (event.kind === 'stop.decision' && event.data.decision_type === 'block') {
		return true;
	}
	return false;
}

function isEventExpandable(event: FeedEvent): boolean {
	return (
		event.kind === 'tool.pre' ||
		event.kind === 'tool.post' ||
		event.kind === 'tool.failure' ||
		event.kind === 'permission.request' ||
		event.kind === 'subagent.stop' ||
		event.kind === 'run.end' ||
		event.kind === 'notification'
	);
}

function deriveRunTitle(
	currentPromptPreview: string | undefined,
	feedEvents: FeedEvent[],
	messages: MessageType[],
): string {
	if (currentPromptPreview?.trim()) {
		return compactText(currentPromptPreview, 44);
	}
	for (let i = feedEvents.length - 1; i >= 0; i--) {
		const event = feedEvents[i]!;
		if (
			event.kind === 'run.start' &&
			event.data.trigger.prompt_preview?.trim()
		) {
			return compactText(event.data.trigger.prompt_preview, 44);
		}
		if (event.kind === 'user.prompt' && event.data.prompt.trim()) {
			return compactText(event.data.prompt, 44);
		}
	}
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]!;
		if (message.role === 'user' && message.content.trim()) {
			return compactText(message.content, 44);
		}
	}
	return 'Untitled run';
}

function formatInputBuffer(
	value: string,
	cursorOffset: number,
	width: number,
	showCursor: boolean,
	placeholder: string,
): string {
	if (width <= 0) return '';
	if (value.length === 0) {
		if (!showCursor) return fit(placeholder, width);
		return fit(`|${placeholder}`, width);
	}

	if (!showCursor) {
		return fit(value, width);
	}

	const withCursor =
		value.slice(0, cursorOffset) + '|' + value.slice(cursorOffset);
	if (withCursor.length <= width) return withCursor.padEnd(width, ' ');

	const desiredStart = Math.max(0, cursorOffset + 1 - Math.floor(width * 0.65));
	const start = Math.min(desiredStart, withCursor.length - width);
	return fit(withCursor.slice(start, start + width), width);
}

function toTodoStatus(status: TodoItem['status']): TodoPanelStatus {
	switch (status) {
		case 'in_progress':
			return 'doing';
		case 'completed':
			return 'done';
		case 'failed':
			return 'blocked';
		default:
			return 'open';
	}
}

function symbolForTodoStatus(status: TodoPanelStatus): string {
	switch (status) {
		case 'done':
			return '[x]';
		case 'doing':
			return '[>]';
		case 'blocked':
			return '[!]';
		default:
			return '[ ]';
	}
}

function formatFeedLine(
	entry: TimelineEntry,
	width: number,
	focused: boolean,
	expanded: boolean,
	matched: boolean,
): string {
	const prefix = `${focused ? '>' : ' '} ${matched ? '*' : ' '} `;
	const suffix = entry.expandable ? (expanded ? ' v' : ' >') : '  ';
	const time = fit(formatClock(entry.ts), 8);
	const run = fit(formatRunLabel(entry.runId), 5);
	const op = fit(entry.op, 10);
	const actor = fit(entry.actor, 8);
	const base = `${time} ${run} ${op} ${actor} ${entry.summary}`;
	const bodyWidth = Math.max(0, width - prefix.length - suffix.length);
	return fit(`${prefix}${fit(base, bodyWidth)}${suffix}`, width);
}

function formatFeedHeaderLine(width: number): string {
	const time = fit('TIME', 8);
	const run = fit('RUN', 5);
	const op = fit('OP', 10);
	const actor = fit('ACTOR', 8);
	return fit(`${time} ${run} ${op} ${actor} SUMMARY`, width);
}

function toRunStatus(event: Extract<FeedEvent, {kind: 'run.end'}>): RunStatus {
	switch (event.data.status) {
		case 'completed':
			return 'SUCCEEDED';
		case 'failed':
			return 'FAILED';
		case 'aborted':
			return 'CANCELLED';
	}
}

/** Fallback for crashed PermissionDialog -- lets user press Escape to deny. */
function PermissionErrorFallback({onDeny}: {onDeny: () => void}) {
	const theme = useTheme();
	useInput((_input, key) => {
		if (key.escape) onDeny();
	});
	return (
		<Text color={theme.status.error}>
			[Permission dialog error -- press Escape to deny and continue]
		</Text>
	);
}

/** Fallback for crashed QuestionDialog -- lets user press Escape to skip. */
function QuestionErrorFallback({onSkip}: {onSkip: () => void}) {
	const theme = useTheme();
	useInput((_input, key) => {
		if (key.escape) onSkip();
	});
	return (
		<Text color={theme.status.error}>
			[Question dialog error -- press Escape to skip and continue]
		</Text>
	);
}

function AppContent({
	projectDir,
	instanceId,
	isolation,
	verbose,
	version,
	pluginMcpConfig,
	modelName,
	initialSessionId,
	onClear,
	onShowSessions,
	inputHistory,
}: Omit<Props, 'claudeCodeVersion' | 'showSessionPicker' | 'theme'> & {
	initialSessionId?: string;
	onClear: () => void;
	onShowSessions: () => void;
	inputHistory: InputHistory;
}) {
	const [messages, setMessages] = useState<MessageType[]>([]);
	const [focusMode, setFocusMode] = useState<FocusMode>('feed');
	const [inputMode, setInputMode] = useState<InputMode>('normal');
	const [todoVisible, setTodoVisible] = useState(true);
	const [todoShowDone, setTodoShowDone] = useState(false);
	const [todoCursor, setTodoCursor] = useState(0);
	const [todoScroll, setTodoScroll] = useState(0);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [feedCursor, setFeedCursor] = useState(0);
	const [tailFollow, setTailFollow] = useState(true);
	const [runFilter, setRunFilter] = useState<string>('all');
	const [showRunOverlay, setShowRunOverlay] = useState(false);
	const [errorsOnly, setErrorsOnly] = useState(false);
	const [detailScroll, setDetailScroll] = useState(0);
	const [searchQuery, setSearchQuery] = useState('');
	const [searchMatchPos, setSearchMatchPos] = useState(0);
	const [extraTodos, setExtraTodos] = useState<TodoPanelItem[]>([]);
	const [todoStatusOverrides, setTodoStatusOverrides] = useState<
		Record<string, TodoPanelStatus>
	>({});

	const messagesRef = useRef(messages);
	messagesRef.current = messages;

	const hookServer = useHookContext();
	const {
		feedEvents,
		items: feedItems,
		tasks,
		session,
		currentRun,
		currentPermissionRequest,
		permissionQueueCount,
		resolvePermission,
		currentQuestionRequest,
		questionQueueCount,
		resolveQuestion,
	} = hookServer;

	const currentSessionId = session?.session_id ?? null;
	const {
		spawn: spawnClaude,
		isRunning: isClaudeRunning,
		tokenUsage,
	} = useClaudeProcess(
		projectDir,
		instanceId,
		isolation,
		pluginMcpConfig,
		verbose,
	);
	const {exit} = useApp();
	const {stdout} = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalRows = stdout?.rows ?? 24;
	const frameWidth = Math.max(4, terminalWidth);
	const innerWidth = frameWidth - 2;
	const topBorder = `+${'-'.repeat(innerWidth)}+`;
	const sectionBorder = `|${'-'.repeat(innerWidth)}|`;
	const frameLine = (content: string): string =>
		`|${fit(content, innerWidth)}|`;

	// Auto-spawn Claude when resuming a session.
	const autoSpawnedRef = useRef(false);
	useEffect(() => {
		if (initialSessionId && !autoSpawnedRef.current) {
			autoSpawnedRef.current = true;
			spawnClaude('', initialSessionId);
		}
	}, [initialSessionId, spawnClaude]);

	const metrics = useHeaderMetrics(feedEvents);
	const elapsed = useDuration(metrics.sessionStartTime);
	const appMode = useAppMode(
		isClaudeRunning,
		currentPermissionRequest,
		currentQuestionRequest,
	);
	const dialogActive =
		appMode.type === 'permission' || appMode.type === 'question';

	const addMessage = useCallback(
		(role: 'user' | 'assistant', content: string) => {
			const newMessage: MessageType = {
				id: generateId(),
				role,
				content,
				timestamp: new Date(),
			};
			setMessages(prev => [...prev, newMessage]);
			return newMessage;
		},
		[],
	);

	const clearScreen = useCallback(() => {
		hookServer.clearEvents();
		// ANSI: clear screen + clear scrollback + cursor home.
		process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
		// Force remount so dashboard fully refreshes.
		onClear();
	}, [hookServer, onClear]);

	const submitPromptOrSlashCommand = useCallback(
		(value: string) => {
			if (!value.trim()) return;

			inputHistory.push(value);
			const result = parseInput(value);

			if (result.type === 'prompt') {
				addMessage('user', result.text);
				spawnClaude(result.text, currentSessionId ?? undefined);
				return;
			}

			addMessage('user', value);
			const addMessageObj = (msg: MessageType) =>
				setMessages(prev => [...prev, msg]);
			executeCommand(result.command, result.args, {
				ui: {
					args: result.args,
					get messages() {
						return messagesRef.current;
					},
					setMessages,
					addMessage: addMessageObj,
					exit,
					clearScreen,
					showSessions: onShowSessions,
					sessionStats: {
						metrics: {
							...metrics,
							modelName: metrics.modelName || modelName,
							tokens: tokenUsage,
						},
						tokens: tokenUsage,
						elapsed,
					},
				},
				hook: {
					args: result.args,
					feed: hookServer,
				},
				prompt: {
					spawn: spawnClaude,
					currentSessionId: currentSessionId ?? undefined,
				},
			});
		},
		[
			inputHistory,
			addMessage,
			spawnClaude,
			currentSessionId,
			exit,
			clearScreen,
			onShowSessions,
			metrics,
			modelName,
			tokenUsage,
			elapsed,
			hookServer,
		],
	);

	const stableItems = useMemo((): FeedItem[] => {
		const messageItems: FeedItem[] = messages.map(m => ({
			type: 'message' as const,
			data: m,
		}));
		return [...messageItems, ...feedItems].sort((a, b) => {
			const tsA = a.type === 'message' ? a.data.timestamp.getTime() : a.data.ts;
			const tsB = b.type === 'message' ? b.data.timestamp.getTime() : b.data.ts;
			return tsA - tsB;
		});
	}, [messages, feedItems]);

	const timelineEntries = useMemo((): TimelineEntry[] => {
		const entries: TimelineEntry[] = [];
		let activeRunId: string | undefined;
		let messageCounter = 1;

		for (const item of stableItems) {
			if (item.type === 'message') {
				const id = `M${String(messageCounter++).padStart(3, '0')}`;
				const summary = compactText(item.data.content, 84);
				const details = item.data.content;
				entries.push({
					id,
					ts: item.data.timestamp.getTime(),
					runId: activeRunId,
					op: item.data.role === 'user' ? 'msg.user' : 'msg.agent',
					actor: item.data.role === 'user' ? 'USER' : 'AGENT',
					summary,
					searchText: `${summary}\n${details}`,
					error: false,
					expandable: details.length > 120,
					details,
				});
				continue;
			}

			const event = item.data;
			if (event.kind === 'run.start') {
				activeRunId = event.run_id;
			}
			const summary = eventSummary(event);
			const details = isEventExpandable(event) ? expansionForEvent(event) : '';
			entries.push({
				id: event.event_id,
				ts: event.ts,
				runId: event.run_id,
				op: eventOperation(event),
				actor: actorLabel(event.actor_id),
				summary,
				searchText: `${summary}\n${details}`,
				error: isEventError(event),
				expandable: isEventExpandable(event),
				details,
			});
			if (event.kind === 'run.end') {
				activeRunId = undefined;
			}
		}
		return entries;
	}, [stableItems]);

	const runSummaries = useMemo((): RunSummary[] => {
		const map = new Map<string, RunSummary>();

		for (const event of feedEvents) {
			if (event.kind === 'run.start') {
				map.set(event.run_id, {
					runId: event.run_id,
					title: compactText(
						event.data.trigger.prompt_preview || 'Untitled run',
						46,
					),
					status: 'RUNNING',
					startedAt: event.ts,
				});
				continue;
			}
			if (event.kind === 'run.end') {
				const existing = map.get(event.run_id);
				if (existing) {
					existing.status = toRunStatus(event);
					existing.endedAt = event.ts;
				} else {
					map.set(event.run_id, {
						runId: event.run_id,
						title: 'Untitled run',
						status: toRunStatus(event),
						startedAt: event.ts,
						endedAt: event.ts,
					});
				}
			}
		}

		const summaries = Array.from(map.values()).sort(
			(a, b) => a.startedAt - b.startedAt,
		);

		if (currentRun) {
			const found = summaries.find(s => s.runId === currentRun.run_id);
			if (found) {
				found.status = 'RUNNING';
			} else {
				summaries.push({
					runId: currentRun.run_id,
					title: compactText(
						currentRun.trigger.prompt_preview || 'Untitled run',
						46,
					),
					status: 'RUNNING',
					startedAt: currentRun.started_at,
				});
			}
		}

		return summaries;
	}, [feedEvents, currentRun]);

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

	const filteredEntries = useMemo(() => {
		return timelineEntries.filter(entry => {
			if (runFilter !== 'all' && entry.runId !== runFilter) return false;
			if (errorsOnly && !entry.error) return false;
			return true;
		});
	}, [timelineEntries, runFilter, errorsOnly]);

	const searchMatches = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return [] as number[];
		const matches: number[] = [];
		for (let i = 0; i < filteredEntries.length; i++) {
			if (filteredEntries[i]!.searchText.toLowerCase().includes(q)) {
				matches.push(i);
			}
		}
		return matches;
	}, [filteredEntries, searchQuery]);

	const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches]);

	const filteredEntriesRef = useRef<TimelineEntry[]>(filteredEntries);
	filteredEntriesRef.current = filteredEntries;
	const runSummariesRef = useRef<RunSummary[]>(runSummaries);
	runSummariesRef.current = runSummaries;
	const visibleTodoItemsRef = useRef<TodoPanelItem[]>(visibleTodoItems);
	visibleTodoItemsRef.current = visibleTodoItems;

	useEffect(() => {
		setFeedCursor(prev =>
			Math.min(prev, Math.max(0, filteredEntries.length - 1)),
		);
	}, [filteredEntries.length]);

	useEffect(() => {
		if (!tailFollow) return;
		setFeedCursor(Math.max(0, filteredEntries.length - 1));
	}, [filteredEntries.length, tailFollow]);

	useEffect(() => {
		setTodoCursor(prev =>
			Math.min(prev, Math.max(0, visibleTodoItems.length - 1)),
		);
	}, [visibleTodoItems.length]);

	useEffect(() => {
		setSearchMatchPos(prev =>
			Math.min(prev, Math.max(0, searchMatches.length - 1)),
		);
	}, [searchMatches.length]);

	useEffect(() => {
		setDetailScroll(0);
	}, [expandedId]);

	useEffect(() => {
		if (expandedId && !filteredEntries.some(entry => entry.id === expandedId)) {
			setExpandedId(null);
		}
	}, [expandedId, filteredEntries]);

	useEffect(() => {
		if (
			focusMode === 'todo' &&
			(!todoVisible || visibleTodoItems.length === 0)
		) {
			setFocusMode('feed');
		}
	}, [focusMode, todoVisible, visibleTodoItems.length]);

	const handlePermissionDecision = useCallback(
		(decision: PermissionDecision) => {
			if (!currentPermissionRequest?.cause?.hook_request_id) return;
			resolvePermission(
				currentPermissionRequest.cause.hook_request_id,
				decision,
			);
		},
		[currentPermissionRequest, resolvePermission],
	);

	const handleQuestionAnswer = useCallback(
		(answers: Record<string, string>) => {
			if (!currentQuestionRequest?.cause?.hook_request_id) return;
			resolveQuestion(currentQuestionRequest.cause.hook_request_id, answers);
		},
		[currentQuestionRequest, resolveQuestion],
	);

	const handleQuestionSkip = useCallback(() => {
		if (!currentQuestionRequest?.cause?.hook_request_id) return;
		resolveQuestion(currentQuestionRequest.cause.hook_request_id, {});
	}, [currentQuestionRequest, resolveQuestion]);

	const runCommand = useCallback(
		(commandLine: string) => {
			const command = commandLine.trim();
			if (!command) return;

			if (command === ':todo') {
				setTodoVisible(v => !v);
				return;
			}

			if (command === ':todo done') {
				setTodoShowDone(v => !v);
				return;
			}

			if (command === ':todo focus') {
				setTodoVisible(true);
				setFocusMode('todo');
				return;
			}

			const todoAddMatch = command.match(/^:todo add(?:\s+(p[0-2]))?\s+(.+)$/i);
			if (todoAddMatch) {
				const priorityToken = (todoAddMatch[1] ?? 'P1').toUpperCase();
				const text = todoAddMatch[2]!.trim();
				if (!text) return;
				const priority =
					priorityToken === 'P0' || priorityToken === 'P2'
						? priorityToken
						: 'P1';
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
				return;
			}

			if (command === ':run list') {
				setShowRunOverlay(true);
				return;
			}

			if (command === ':run all') {
				setRunFilter('all');
				setShowRunOverlay(false);
				setTailFollow(true);
				setFeedCursor(Math.max(0, filteredEntriesRef.current.length - 1));
				return;
			}

			const runMatch = command.match(/^:run\s+(.+)$/i);
			if (runMatch) {
				const needle = runMatch[1]!.trim().toLowerCase();
				const hit = runSummariesRef.current.find(summary => {
					return (
						summary.runId.toLowerCase() === needle ||
						formatRunLabel(summary.runId).toLowerCase() === needle
					);
				});
				if (!hit) {
					addMessage('assistant', `No run matched "${needle}"`);
					return;
				}
				setRunFilter(hit.runId);
				setShowRunOverlay(false);
				setTailFollow(true);
				setFeedCursor(Math.max(0, filteredEntriesRef.current.length - 1));
				return;
			}

			if (command === ':tail') {
				setTailFollow(true);
				setFeedCursor(Math.max(0, filteredEntriesRef.current.length - 1));
				return;
			}

			const jumpMatch = command.match(/^:jump\s+(.+)$/i);
			if (jumpMatch) {
				const needle = jumpMatch[1]!.trim().toLowerCase();
				const idx = filteredEntriesRef.current.findIndex(entry => {
					const id = entry.id.toLowerCase();
					return id === needle || id.endsWith(needle);
				});
				if (idx < 0) {
					addMessage('assistant', `No event matched "${needle}"`);
					return;
				}
				setFeedCursor(idx);
				setTailFollow(false);
				setFocusMode('feed');
				return;
			}

			if (command === ':errors') {
				setErrorsOnly(v => !v);
				setTailFollow(true);
				setFeedCursor(Math.max(0, filteredEntriesRef.current.length - 1));
				return;
			}

			addMessage('assistant', `Unknown command: ${command}`);
		},
		[addMessage],
	);

	const setInputValueRef = useRef<(value: string) => void>(() => {});
	const inputValueRef = useRef('');

	const handleInputSubmit = useCallback(
		(rawValue: string) => {
			const trimmed = rawValue.trim();
			if (!trimmed) {
				setInputValueRef.current('');
				setInputMode('normal');
				setFocusMode('feed');
				return;
			}

			if (trimmed.startsWith(':') || inputMode === 'cmd') {
				runCommand(trimmed.startsWith(':') ? trimmed : `:${trimmed}`);
				setInputValueRef.current('');
				setInputMode('normal');
				setFocusMode('feed');
				return;
			}

			const parsedSlash = parseInput(trimmed);
			if (parsedSlash.type === 'command') {
				submitPromptOrSlashCommand(trimmed);
				setInputValueRef.current('');
				setInputMode('normal');
				setFocusMode('feed');
				return;
			}

			if (trimmed.startsWith('/') || inputMode === 'search') {
				const query = trimmed.replace(/^\//, '').trim();
				setSearchQuery(query);
				if (query.length > 0) {
					const q = query.toLowerCase();
					const firstIdx = filteredEntriesRef.current.findIndex(entry =>
						entry.searchText.toLowerCase().includes(q),
					);
					if (firstIdx >= 0) {
						setFeedCursor(firstIdx);
						setTailFollow(false);
						setSearchMatchPos(0);
					}
				}
				setInputValueRef.current('');
				setInputMode('normal');
				setFocusMode('feed');
				return;
			}

			submitPromptOrSlashCommand(trimmed);
			setInputValueRef.current('');
			setInputMode('normal');
			setFocusMode('feed');
		},
		[inputMode, runCommand, submitPromptOrSlashCommand],
	);

	const {
		value: inputValue,
		cursorOffset,
		setValue: setInputValue,
	} = useTextInput({
		onChange: value => {
			inputValueRef.current = value;
			if (value.startsWith(':')) {
				setInputMode('cmd');
				return;
			}
			if (value.startsWith('/')) {
				setInputMode('search');
				setSearchQuery(value.replace(/^\//, '').trim());
				return;
			}
			if (value.length === 0) {
				setInputMode('normal');
				setSearchQuery('');
			}
		},
		onSubmit: handleInputSubmit,
		isActive: focusMode === 'input' && !dialogActive,
	});
	setInputValueRef.current = setInputValue;
	inputValueRef.current = inputValue;

	const moveFeedCursor = useCallback((delta: number) => {
		setFeedCursor(prev => {
			const max = Math.max(0, filteredEntriesRef.current.length - 1);
			return Math.max(0, Math.min(prev + delta, max));
		});
		setTailFollow(false);
	}, []);

	const jumpToTail = useCallback(() => {
		setTailFollow(true);
		setFeedCursor(Math.max(0, filteredEntriesRef.current.length - 1));
	}, []);

	const jumpToTop = useCallback(() => {
		setTailFollow(false);
		setFeedCursor(0);
	}, []);

	const toggleExpandedAtCursor = useCallback(() => {
		const entry = filteredEntriesRef.current[feedCursor];
		if (!entry?.expandable) return;
		setExpandedId(prev => (prev === entry.id ? null : entry.id));
	}, [feedCursor]);

	const cycleFocus = useCallback(() => {
		setFocusMode(prev => {
			if (prev === 'feed') return 'input';
			if (prev === 'input') {
				if (todoVisible && visibleTodoItemsRef.current.length > 0)
					return 'todo';
				return 'feed';
			}
			return 'feed';
		});
	}, [todoVisible]);

	const runTitle = deriveRunTitle(
		currentRun?.trigger.prompt_preview,
		feedEvents,
		messages,
	);
	const sessionLabel = formatSessionLabel(session?.session_id);
	const selectedRunId =
		runFilter === 'all'
			? (currentRun?.run_id ?? runSummaries[runSummaries.length - 1]?.runId)
			: runFilter;
	const runLabel = formatRunLabel(selectedRunId);
	const mainActor = compactText(session?.agent_type ?? 'Agent', 16);

	const doneCount = todoItems.filter(todo => todo.status === 'done').length;
	const doingCount = todoItems.filter(todo => todo.status === 'doing').length;
	const blockedCount = todoItems.filter(
		todo => todo.status === 'blocked',
	).length;
	const openCount = todoItems.filter(todo => todo.status === 'open').length;
	const stepCurrent = doneCount + (doingCount > 0 ? 1 : 0);
	const stepTotal = Math.max(todoItems.length, stepCurrent);

	const latestRunStatus: RunStatus = (() => {
		if (currentRun) return 'RUNNING';
		const tail = runSummaries[runSummaries.length - 1];
		return tail?.status ?? 'SUCCEEDED';
	})();

	const headerLine1 = fit(
		`ATHENA | session ${sessionLabel} | run ${runLabel}: ${runTitle} | main: ${mainActor}`,
		innerWidth,
	);
	const headerLine2 = fit(
		`${latestRunStatus.padEnd(9, ' ')} | step ${String(stepCurrent).padStart(2, ' ')}/${String(stepTotal).padEnd(2, ' ')} | tools ${String(metrics.totalToolCallCount).padStart(4, ' ')} | sub ${String(metrics.subagentCount).padStart(3, ' ')} | err ${String(metrics.failures).padStart(3, ' ')} | blk ${String(metrics.blocks).padStart(3, ' ')} | tok ${formatCount(tokenUsage.total).padStart(8, ' ')}${tailFollow ? ' | TAIL' : ''}`,
		innerWidth,
	);

	const bodyHeight = Math.max(
		1,
		terminalRows - HEADER_ROWS - FOOTER_ROWS - FRAME_BORDER_ROWS,
	);
	const expandedEntry = expandedId
		? (filteredEntries.find(entry => entry.id === expandedId) ?? null)
		: null;
	const detailLines = useMemo(() => {
		if (!expandedEntry) return [];
		return expandedEntry.details.split(/\r?\n/).map(line => toAscii(line));
	}, [expandedEntry]);
	const detailHeaderRows = expandedEntry ? 1 : 0;
	const detailContentRows = expandedEntry
		? Math.max(1, bodyHeight - detailHeaderRows)
		: 0;
	const maxDetailScroll = Math.max(0, detailLines.length - detailContentRows);
	const detailPageStep = Math.max(1, Math.floor(detailContentRows / 2));

	const todoRowsTarget = expandedEntry
		? 0
		: todoVisible
		? Math.min(
				TODO_PANEL_MAX_ROWS,
				1 +
					Math.max(
						1,
						Math.min(visibleTodoItems.length, TODO_PANEL_MAX_ROWS - 1),
					),
			)
		: 0;
	const runOverlayRowsTarget = expandedEntry
		? 0
		: showRunOverlay
		? Math.min(RUN_OVERLAY_MAX_ROWS, 1 + Math.max(1, runSummaries.length))
		: 0;

	let remainingRows = bodyHeight;
	const todoRows = Math.min(todoRowsTarget, Math.max(0, remainingRows - 1));
	remainingRows -= todoRows;
	const runOverlayRows = Math.min(
		runOverlayRowsTarget,
		Math.max(0, remainingRows - 1),
	);
	remainingRows -= runOverlayRows;
	const feedRows = expandedEntry ? 0 : Math.max(1, remainingRows);
	const feedHeaderRows = feedRows > 1 ? 1 : 0;
	const feedContentRows = Math.max(0, feedRows - feedHeaderRows);
	const pageStep = Math.max(1, Math.floor(Math.max(1, feedContentRows) / 2));
	const scrollDetail = useCallback(
		(delta: number) => {
			setDetailScroll(prev =>
				Math.max(0, Math.min(prev + delta, maxDetailScroll)),
			);
		},
		[maxDetailScroll],
	);

	const feedViewportStart = useMemo(() => {
		const total = filteredEntries.length;
		if (feedContentRows <= 0) return 0;
		if (total <= feedContentRows) return 0;

		let start = tailFollow
			? total - feedContentRows
			: Math.max(
					0,
					Math.min(
						feedCursor - Math.floor(feedContentRows / 2),
						total - feedContentRows,
					),
				);

		if (feedCursor < start) start = feedCursor;
		if (feedCursor >= start + feedContentRows) {
			start = feedCursor - feedContentRows + 1;
		}

		return Math.max(0, Math.min(start, total - feedContentRows));
	}, [filteredEntries.length, feedCursor, feedContentRows, tailFollow]);

	const feedViewportEnd = Math.min(
		filteredEntries.length,
		feedViewportStart + feedContentRows,
	);
	const feedRenderStart = Math.max(0, feedViewportStart - FEED_OVERSCAN);
	const feedRenderEnd = Math.min(
		filteredEntries.length,
		feedViewportEnd + FEED_OVERSCAN,
	);

	const visibleFeedEntries = filteredEntries.slice(
		feedViewportStart,
		feedViewportEnd,
	);

	useEffect(() => {
		setDetailScroll(prev => Math.min(prev, maxDetailScroll));
	}, [maxDetailScroll]);

	const todoListHeight = Math.max(0, todoRows - 1);
	useEffect(() => {
		if (todoListHeight <= 0) {
			setTodoScroll(0);
			return;
		}
		setTodoScroll(prev => {
			if (todoCursor < prev) return todoCursor;
			if (todoCursor >= prev + todoListHeight) {
				return todoCursor - todoListHeight + 1;
			}
			const maxScroll = Math.max(0, visibleTodoItems.length - todoListHeight);
			return Math.min(prev, maxScroll);
		});
	}, [todoCursor, todoListHeight, visibleTodoItems.length]);

	useInput(
		(input, key) => {
			if (dialogActive) return;

			if (key.ctrl && input === 't') {
				setTodoVisible(v => !v);
				if (focusMode === 'todo') setFocusMode('feed');
				return;
			}

			if (focusMode === 'input') {
				if (key.escape) {
					setFocusMode('feed');
					setInputMode('normal');
					return;
				}
				if (key.tab) {
					cycleFocus();
					return;
				}
				if (key.ctrl && input === 'p') {
					const prev = inputHistory.back(inputValueRef.current);
					if (prev !== undefined) setInputValueRef.current(prev);
					return;
				}
				if (key.ctrl && input === 'n') {
					const next = inputHistory.forward();
					if (next !== undefined) setInputValueRef.current(next);
					return;
				}
				return;
			}

			if (focusMode === 'todo') {
				if (key.escape) {
					setFocusMode('feed');
					return;
				}
				if (key.tab) {
					cycleFocus();
					return;
				}
				if (key.upArrow || (key.ctrl && key.upArrow)) {
					setTodoCursor(prev => Math.max(0, prev - 1));
					return;
				}
				if (key.downArrow || (key.ctrl && key.downArrow)) {
					setTodoCursor(prev =>
						Math.min(
							Math.max(0, visibleTodoItemsRef.current.length - 1),
							prev + 1,
						),
					);
					return;
				}
				if (input === ' ') {
					const selected = visibleTodoItemsRef.current[todoCursor];
					if (!selected) return;
					setTodoStatusOverrides(prev => ({
						...prev,
						[selected.id]:
							(prev[selected.id] ?? selected.status) === 'done'
								? 'open'
								: 'done',
					}));
					return;
				}
				if (key.return) {
					const selected = visibleTodoItemsRef.current[todoCursor];
					if (!selected?.linkedEventId) return;
					const idx = filteredEntriesRef.current.findIndex(
						entry => entry.id === selected.linkedEventId,
					);
					if (idx >= 0) {
						setFeedCursor(idx);
						setTailFollow(false);
						setFocusMode('feed');
					}
					return;
				}
				if (input.toLowerCase() === 'a') {
					setFocusMode('input');
					setInputMode('cmd');
					setInputValueRef.current(':todo add ');
					return;
				}
				return;
			}

			// Feed focus
			if (key.escape) {
				if (expandedId) {
					setExpandedId(null);
					return;
				}
				setShowRunOverlay(false);
				return;
			}

			if (expandedEntry) {
				if (key.return || input === 'q' || input === 'Q') {
					setExpandedId(null);
					return;
				}
				if (key.home) {
					setDetailScroll(0);
					return;
				}
				if (key.end) {
					setDetailScroll(maxDetailScroll);
					return;
				}
				if (key.pageUp) {
					scrollDetail(-detailPageStep);
					return;
				}
				if (key.pageDown) {
					scrollDetail(detailPageStep);
					return;
				}
				if (key.ctrl && key.upArrow) {
					scrollDetail(-1);
					return;
				}
				if (key.ctrl && key.downArrow) {
					scrollDetail(1);
					return;
				}
				if (key.upArrow) {
					scrollDetail(-1);
					return;
				}
				if (key.downArrow) {
					scrollDetail(1);
					return;
				}
				if (input === 'k' || input === 'K') {
					scrollDetail(-1);
					return;
				}
				if (input === 'j' || input === 'J') {
					scrollDetail(1);
					return;
				}
				return;
			}

			if (key.tab) {
				cycleFocus();
				return;
			}

			if (input === ':') {
				setFocusMode('input');
				setInputMode('cmd');
				setInputValueRef.current(':');
				return;
			}

			if (input === '/') {
				setFocusMode('input');
				setInputMode('search');
				setInputValueRef.current('/');
				return;
			}

			if (key.home) {
				jumpToTop();
				return;
			}
			if (key.end) {
				jumpToTail();
				return;
			}
			if (key.pageUp) {
				moveFeedCursor(-pageStep);
				return;
			}
			if (key.pageDown) {
				moveFeedCursor(pageStep);
				return;
			}
			if (key.ctrl && key.upArrow) {
				moveFeedCursor(-1);
				return;
			}
			if (key.ctrl && key.downArrow) {
				moveFeedCursor(1);
				return;
			}
			if (key.upArrow) {
				moveFeedCursor(-1);
				return;
			}
			if (key.downArrow) {
				moveFeedCursor(1);
				return;
			}

			if (key.return || (key.ctrl && key.rightArrow)) {
				toggleExpandedAtCursor();
				return;
			}

			if ((input === 'n' || input === 'N') && searchMatches.length > 0) {
				const direction = input === 'n' ? 1 : -1;
				setSearchMatchPos(prev => {
					const count = searchMatches.length;
					const next = (prev + direction + count) % count;
					const target = searchMatches[next]!;
					setFeedCursor(target);
					setTailFollow(false);
					return next;
				});
				return;
			}

			if (key.ctrl && input === 'l') {
				setSearchQuery('');
				setShowRunOverlay(false);
				jumpToTail();
				return;
			}
		},
		{
			isActive: !dialogActive,
		},
	);

	const footerHelp = (() => {
		if (focusMode === 'todo') {
			return 'TODO: up/down select  Space toggle done  Enter jump  a add  Esc back';
		}
		if (focusMode === 'input') {
			return 'INPUT: Enter send  Esc back  Tab focus  Ctrl+P/N history';
		}
		if (expandedEntry) {
			return 'DETAILS: Up/Down or j/k scroll  PgUp/PgDn jump  Enter/Esc back';
		}
		const searchPart =
			searchQuery && searchMatches.length > 0
				? ` | search ${searchMatchPos + 1}/${searchMatches.length}`
				: searchQuery
					? ' | search 0/0'
					: '';
		return `FEED: Ctrl+Up/Down move  Enter expand  / search  : cmd  End tail${searchPart}`;
	})();

	const runBadge = isClaudeRunning ? '[RUN]' : '[IDLE]';
	const modeBadges = [
		runBadge,
		...(inputMode === 'cmd' ? ['[CMD]'] : []),
		...(inputMode === 'search' ? ['[SEARCH]'] : []),
	];
	const badgeText = modeBadges.join('');
	const inputPrefix = 'input> ';
	const inputContentWidth = Math.max(
		1,
		innerWidth - inputPrefix.length - badgeText.length,
	);
	const inputPlaceholder =
		inputMode === 'cmd'
			? ':command'
			: inputMode === 'search'
				? '/search'
				: 'Type a prompt or :command';
	const inputBuffer = dialogActive
		? fit(
				appMode.type === 'question'
					? 'Answer question in dialog...'
					: 'Respond to permission dialog...',
				inputContentWidth,
			)
		: formatInputBuffer(
				inputValue,
				cursorOffset,
				inputContentWidth,
				focusMode === 'input',
				inputPlaceholder,
			);
	const inputLine = fit(`${inputPrefix}${inputBuffer}${badgeText}`, innerWidth);

	const bodyLines: string[] = [];
	if (expandedEntry) {
		const start = Math.min(detailScroll, maxDetailScroll);
		const end = Math.min(detailLines.length, start + detailContentRows);
		const lineNumberWidth = String(Math.max(1, detailLines.length)).length;
		const rangeLabel =
			detailLines.length === 0 ? '0/0' : `${start + 1}-${end}/${detailLines.length}`;
		bodyLines.push(
			fit(
				`[DETAILS] ${expandedEntry.id} (${expandedEntry.op} @${expandedEntry.actor}) ${rangeLabel} [Esc back]`,
				innerWidth,
			),
		);
		for (let i = 0; i < detailContentRows; i++) {
			const line = detailLines[start + i];
			if (line === undefined) {
				bodyLines.push(fit('', innerWidth));
				continue;
			}
			const lineNo = String(start + i + 1).padStart(lineNumberWidth, ' ');
			bodyLines.push(fit(`${lineNo} | ${line}`, innerWidth));
		}
	} else {
		if (todoRows > 0) {
			const todoHeader = `[TODO] (${runLabel}) ${openCount} open / ${doingCount} doing / ${doneCount} done${blockedCount > 0 ? ` / ${blockedCount} blocked` : ''}${todoShowDone ? ' [all]' : ' [open]'}`;
			bodyLines.push(fit(todoHeader, innerWidth));

			for (let i = 0; i < todoRows - 1; i++) {
				const todo = visibleTodoItems[todoScroll + i];
				if (!todo) {
					bodyLines.push(fit('', innerWidth));
					continue;
				}
				const focused = focusMode === 'todo' && todoCursor === todoScroll + i;
				const link = todo.linkedEventId ? ` <- ${todo.linkedEventId}` : '';
				const owner = todo.owner ? ` @${todo.owner}` : '';
				const line = `${focused ? '>' : ' '} ${symbolForTodoStatus(todo.status)} ${todo.priority} ${compactText(todo.text, 48)}${link}${owner}`;
				bodyLines.push(fit(line, innerWidth));
			}
		}

		if (runOverlayRows > 0) {
			bodyLines.push(fit('[RUNS] :run <id>  :run all', innerWidth));
			const listRows = runOverlayRows - 1;
			const start = Math.max(0, runSummaries.length - listRows);
			for (let i = 0; i < runOverlayRows - 1; i++) {
				const summary = runSummaries[start + i];
				if (!summary) {
					bodyLines.push(fit('', innerWidth));
					continue;
				}
				const active =
					runFilter !== 'all' && runFilter === summary.runId ? '*' : ' ';
				const line = `${active} ${formatRunLabel(summary.runId)} ${summary.status.padEnd(9, ' ')} ${compactText(summary.title, 48)}`;
				bodyLines.push(fit(line, innerWidth));
			}
		}

		const visibleIndexSet = new Set<number>();
		for (let i = feedRenderStart; i < feedRenderEnd; i++) {
			visibleIndexSet.add(i);
		}

	if (feedHeaderRows > 0) {
		bodyLines.push(formatFeedHeaderLine(innerWidth));
	}

	if (feedContentRows > 0) {
		if (visibleFeedEntries.length === 0) {
			bodyLines.push(fit('(no feed events)', innerWidth));
			for (let i = 1; i < feedContentRows; i++) {
				bodyLines.push(fit('', innerWidth));
			}
		} else {
			for (let i = 0; i < feedContentRows; i++) {
				const idx = feedViewportStart + i;
				const entry = filteredEntries[idx];
				if (!entry) {
					bodyLines.push(fit('', innerWidth));
					continue;
				}
				if (!visibleIndexSet.has(idx)) {
					bodyLines.push(fit('', innerWidth));
					continue;
				}
				bodyLines.push(
					formatFeedLine(
						entry,
						innerWidth,
						focusMode === 'feed' && idx === feedCursor,
						expandedId === entry.id,
						searchMatchSet.has(idx),
					),
				);
			}
		}
	}
	}

	const clippedBodyLines = bodyLines.slice(0, bodyHeight);
	while (clippedBodyLines.length < bodyHeight) {
		clippedBodyLines.push(fit('', innerWidth));
	}

	return (
		<Box flexDirection="column" width={frameWidth}>
			<Text>{topBorder}</Text>
			<Text>{frameLine(headerLine1)}</Text>
			<Text>{frameLine(headerLine2)}</Text>
			<Text>{sectionBorder}</Text>
			{clippedBodyLines.map((line, index) => (
				<Text key={`body-${index}`}>{frameLine(line)}</Text>
			))}
			<Text>{sectionBorder}</Text>
			<Text>{frameLine(fit(footerHelp, innerWidth))}</Text>
			<Text>{frameLine(inputLine)}</Text>
			<Text>{topBorder}</Text>

			{appMode.type === 'permission' && currentPermissionRequest && (
				<ErrorBoundary
					fallback={
						<PermissionErrorFallback
							onDeny={() => handlePermissionDecision('deny')}
						/>
					}
				>
					<PermissionDialog
						request={currentPermissionRequest}
						queuedCount={permissionQueueCount - 1}
						onDecision={handlePermissionDecision}
					/>
				</ErrorBoundary>
			)}
			{appMode.type === 'question' && currentQuestionRequest && (
				<ErrorBoundary
					fallback={<QuestionErrorFallback onSkip={handleQuestionSkip} />}
				>
					<QuestionDialog
						request={currentQuestionRequest}
						queuedCount={questionQueueCount - 1}
						onAnswer={handleQuestionAnswer}
						onSkip={handleQuestionSkip}
					/>
				</ErrorBoundary>
			)}
		</Box>
	);
}

export default function App({
	projectDir,
	instanceId,
	isolation,
	verbose,
	version,
	pluginMcpConfig,
	modelName,
	theme,
	initialSessionId,
	showSessionPicker,
}: Props) {
	const [clearCount, setClearCount] = useState(0);
	const inputHistory = useInputHistory(projectDir);

	const initialPhase: AppPhase = showSessionPicker
		? {type: 'session-select'}
		: {type: 'main', initialSessionId};
	const [phase, setPhase] = useState<AppPhase>(initialPhase);

	const handleSessionSelect = useCallback((sessionId: string) => {
		setPhase({type: 'main', initialSessionId: sessionId});
	}, []);

	const handleSessionCancel = useCallback(() => {
		setPhase({type: 'main'});
	}, []);

	const handleShowSessions = useCallback(() => {
		setPhase({type: 'session-select'});
	}, []);

	const sessions = useMemo(
		() => (phase.type === 'session-select' ? readSessionIndex(projectDir) : []),
		[projectDir, phase],
	);

	if (phase.type === 'session-select') {
		return (
			<ErrorBoundary
				fallback={
					<Text color="red">
						[Session picker error -- starting new session]
					</Text>
				}
			>
				<SessionPicker
					sessions={sessions}
					onSelect={handleSessionSelect}
					onCancel={handleSessionCancel}
				/>
			</ErrorBoundary>
		);
	}

	return (
		<ThemeProvider value={theme}>
			<HookProvider projectDir={projectDir} instanceId={instanceId}>
				<AppContent
					key={clearCount}
					projectDir={projectDir}
					instanceId={instanceId}
					isolation={isolation}
					verbose={verbose}
					version={version}
					pluginMcpConfig={pluginMcpConfig}
					modelName={modelName}
					initialSessionId={phase.initialSessionId}
					onClear={() => setClearCount(c => c + 1)}
					onShowSessions={handleShowSessions}
					inputHistory={inputHistory}
				/>
			</HookProvider>
		</ThemeProvider>
	);
}
