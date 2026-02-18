import process from 'node:process';
import React, {useState, useCallback, useRef, useEffect, useMemo} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import PermissionDialog from './components/PermissionDialog.js';
import QuestionDialog from './components/QuestionDialog.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import DashboardFrame, {
	type DashboardTimelineRow,
} from './components/DashboardFrame.js';
import DashboardInput from './components/DashboardInput.js';
import {HookProvider, useHookContext} from './context/HookContext.js';
import {useClaudeProcess} from './hooks/useClaudeProcess.js';
import {useHeaderMetrics} from './hooks/useHeaderMetrics.js';
import {useDuration} from './hooks/useDuration.js';
import {useAppMode} from './hooks/useAppMode.js';
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

const MAX_VISIBLE_TODOS = 4;

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

function eventTypeLabel(event: FeedEvent): string {
	switch (event.kind) {
		case 'tool.pre':
			return 'tool.call';
		case 'tool.post':
			return 'tool.result OK';
		case 'tool.failure':
			return 'tool.result ERR';
		case 'subagent.start':
			return 'agent.spawn';
		case 'subagent.stop':
			return 'agent.join';
		default:
			return event.kind;
	}
}

function eventSummary(event: FeedEvent): string {
	switch (event.kind) {
		case 'run.start':
			return compactText(
				event.data.trigger.prompt_preview || event.title || 'run started',
				64,
			);
		case 'run.end':
			return `status=${event.data.status}`;
		case 'user.prompt':
			return compactText(JSON.stringify(event.data.prompt), 64);
		case 'tool.pre': {
			const args = summarizeToolInput(event.data.tool_input);
			return compactText(`${event.data.tool_name} ${args}`.trim(), 64);
		}
		case 'tool.post':
			return compactText(`${event.data.tool_name} ok`, 64);
		case 'tool.failure':
			return compactText(event.data.error, 64);
		case 'subagent.start':
			return compactText(
				`spawned ${event.data.agent_type} (${event.data.agent_id})`,
				64,
			);
		case 'subagent.stop':
			return compactText(
				`${event.data.agent_type} finished (${event.data.agent_id})`,
				64,
			);
		case 'permission.request':
			return compactText(`request ${event.data.tool_name}`, 64);
		case 'permission.decision':
			return compactText(`decision=${event.data.decision_type}`, 64);
		case 'notification':
			return compactText(event.data.message, 64);
		default:
			return compactText(event.title || event.kind, 64);
	}
}

function todoLines(tasks: TodoItem[]): string[] {
	if (tasks.length === 0) return ['  (no tasks)'];

	const lines = tasks.slice(0, MAX_VISIBLE_TODOS).map(task => {
		const symbol =
			task.status === 'completed'
				? '[x]'
				: task.status === 'in_progress'
					? '[>]'
					: task.status === 'failed'
						? '[!]'
						: '[ ]';
		const suffix =
			task.status === 'in_progress' && task.activeForm
				? ` -- ${task.activeForm}`
				: task.status === 'failed'
					? ' -- failed'
					: '';
		return `  ${symbol} ${compactText(task.content, 56)}${compactText(suffix, 32)}`;
	});

	if (tasks.length > MAX_VISIBLE_TODOS) {
		lines.push(`  ... ${tasks.length - MAX_VISIBLE_TODOS} more`);
	}

	return lines;
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
	const [timelineScroll, setTimelineScroll] = useState(0);
	const messagesRef = useRef(messages);
	messagesRef.current = messages;

	const hookServer = useHookContext();
	const {
		feedEvents,
		items: feedItems,
		tasks,
		isServerRunning,
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
		sendInterrupt,
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
		// Force remount so dashboard frame fully refreshes.
		onClear();
	}, [hookServer, onClear]);

	const handleSubmit = useCallback(
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
			addMessage,
			spawnClaude,
			currentSessionId,
			hookServer,
			exit,
			clearScreen,
			onShowSessions,
			inputHistory,
			metrics,
			modelName,
			tokenUsage,
			elapsed,
		],
	);

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

	const timelineRows = useMemo((): DashboardTimelineRow[] => {
		let messageCounter = 1;
		return stableItems.map(item => {
			if (item.type === 'message') {
				const id = `M${String(messageCounter++).padStart(3, '0')}`;
				return {
					time: formatClock(item.data.timestamp.getTime()),
					eventId: id,
					type:
						item.data.role === 'user' ? 'user.message' : 'assistant.message',
					actor: item.data.role === 'user' ? 'USER' : 'AGENT',
					summary: compactText(item.data.content, 64),
				};
			}

			const event = item.data;
			return {
				time: formatClock(event.ts),
				eventId: event.event_id,
				type: eventTypeLabel(event),
				actor: actorLabel(event.actor_id),
				summary: eventSummary(event),
			};
		});
	}, [stableItems]);

	const appMode = useAppMode(
		isClaudeRunning,
		currentPermissionRequest,
		currentQuestionRequest,
	);
	const dialogActive =
		appMode.type === 'permission' || appMode.type === 'question';

	const runTitle = deriveRunTitle(
		currentRun?.trigger.prompt_preview,
		feedEvents,
		messages,
	);
	const sessionLabel = formatSessionLabel(session?.session_id);
	const runLabel = formatRunLabel(currentRun?.run_id);
	const mainActor = compactText(session?.agent_type ?? 'Agent', 20);

	const doneCount = tasks.filter(t => t.status === 'completed').length;
	const doingCount = tasks.filter(t => t.status === 'in_progress').length;
	const openCount = tasks.filter(
		t => t.status === 'pending' || t.status === 'failed',
	).length;
	const stepCurrent = doneCount + (doingCount > 0 ? 1 : 0);
	const stepTotal = Math.max(tasks.length, stepCurrent);

	const statusLabel =
		appMode.type === 'working'
			? 'RUNNING'
			: appMode.type === 'idle'
				? 'IDLE'
				: 'WAITING';

	const headerLine1 = `ATHENA v${version} | session ${sessionLabel} | run ${runLabel}: ${runTitle} | main: ${mainActor}`;
	const headerLine2 = `${statusLabel} | step ${stepCurrent}/${stepTotal} | tools ${metrics.totalToolCallCount} | subagents ${metrics.subagentCount} | errors ${metrics.failures} | tokens ${formatCount(tokenUsage.total)}`;

	const renderedTodoLines = useMemo(() => todoLines(tasks), [tasks]);
	const todoHeader = `[TODO] (run ${runLabel}) ${openCount} open / ${doingCount} doing`;

	const reservedRows = 10 + renderedTodoLines.length;
	const timelineCapacity = Math.max(5, terminalRows - reservedRows);
	const maxTimelineScroll = Math.max(0, timelineRows.length - timelineCapacity);

	useEffect(() => {
		setTimelineScroll(prev => Math.min(prev, maxTimelineScroll));
	}, [maxTimelineScroll]);

	const visibleTimelineRows = useMemo(() => {
		if (timelineRows.length === 0) return [];
		const endExclusive = Math.max(0, timelineRows.length - timelineScroll);
		const start = Math.max(0, endExclusive - timelineCapacity);
		return timelineRows.slice(start, endExclusive);
	}, [timelineRows, timelineScroll, timelineCapacity]);

	useInput(
		(_input, key) => {
			if (key.upArrow) {
				setTimelineScroll(prev => Math.min(maxTimelineScroll, prev + 1));
				return;
			}
			if (key.downArrow) {
				setTimelineScroll(prev => Math.max(0, prev - 1));
				return;
			}
			if (key.ctrl && _input === 'l') {
				setTimelineScroll(0);
			}
		},
		{isActive: !dialogActive},
	);

	return (
		<Box flexDirection="column">
			<DashboardFrame
				width={terminalWidth}
				headerLine1={headerLine1}
				headerLine2={headerLine2}
				todoHeader={todoHeader}
				todoLines={renderedTodoLines}
				timelineRows={visibleTimelineRows}
				footerLine={
					'/help /todo /sessions  up/down scroll  ctrl+p/n history  enter send'
				}
				renderInput={innerWidth => (
					<DashboardInput
						width={innerWidth}
						onSubmit={handleSubmit}
						disabled={dialogActive}
						disabledMessage={
							appMode.type === 'question'
								? 'Answer question above...'
								: appMode.type === 'permission'
									? 'Respond to permission request above...'
									: undefined
						}
						onEscape={isClaudeRunning ? sendInterrupt : undefined}
						onHistoryBack={inputHistory.back}
						onHistoryForward={inputHistory.forward}
						runLabel={isClaudeRunning ? 'RUN' : dialogActive ? 'WAIT' : 'SEND'}
					/>
				)}
			/>

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
