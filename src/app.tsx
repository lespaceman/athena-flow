import process from 'node:process';
import React, {
	Profiler,
	useState,
	useCallback,
	useRef,
	useEffect,
	useMemo,
} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {TextInput} from '@inkjs/ui';
import PermissionDialog from './components/PermissionDialog.js';
import QuestionDialog from './components/QuestionDialog.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import {HookProvider, useHookContextSelector} from './context/HookContext.js';
import {useClaudeProcess} from './hooks/useClaudeProcess.js';
import {useHeaderMetrics} from './hooks/useHeaderMetrics.js';
import {useAppMode} from './hooks/useAppMode.js';
import {type InputHistory, useInputHistory} from './hooks/useInputHistory.js';
import {useFeedNavigation} from './hooks/useFeedNavigation.js';
import {useTodoPanel} from './hooks/useTodoPanel.js';
import {useFeedKeyboard} from './hooks/useFeedKeyboard.js';
import {useTodoKeyboard} from './hooks/useTodoKeyboard.js';
import {useSpinner} from './hooks/useSpinner.js';
import {useTimeline} from './hooks/useTimeline.js';
import {useLayout} from './hooks/useLayout.js';
import {useCommandDispatch} from './hooks/useCommandDispatch.js';
import {buildBodyLines} from './utils/buildBodyLines.js';
import {FeedGrid} from './components/FeedGrid.js';
import {FrameRow} from './components/FrameRow.js';
import {useFeedColumns} from './hooks/useFeedColumns.js';
import {buildFrameLines} from './utils/buildFrameLines.js';
import {buildHeaderModel} from './utils/headerModel.js';
import {renderHeaderLines} from './utils/renderHeaderLines.js';
import {
	type Message as MessageType,
	type IsolationConfig,
	generateId,
} from './types/index.js';
import type {IsolationPreset} from './types/isolation.js';
import {type PermissionDecision} from './types/server.js';
import {parseInput} from './commands/parser.js';
import {executeCommand} from './commands/executor.js';
import {
	ThemeProvider,
	useTheme,
	type Theme,
	resolveTheme,
} from './theme/index.js';
import SessionPicker from './components/SessionPicker.js';
import type {SessionEntry} from './utils/sessionIndex.js';
import {listSessions, getSessionMeta} from './sessions/registry.js';
import {fit, fitAnsi} from './utils/format.js';
import {frameGlyphs} from './glyphs/index.js';
import type {WorkflowConfig} from './workflows/types.js';
import SetupWizard from './setup/SetupWizard.js';
import {bootstrapRuntimeConfig} from './runtime/bootstrapConfig.js';
import {
	isPerfEnabled,
	logPerfEvent,
	logReactCommit,
	startEventLoopMonitor,
	startInputMeasure,
} from './utils/perf.js';

type Props = {
	projectDir: string;
	instanceId: number;
	isolation?: IsolationConfig;
	verbose?: boolean;
	version: string;
	pluginMcpConfig?: string;
	modelName: string | null;
	theme: Theme;
	initialSessionId?: string;
	showSessionPicker?: boolean;
	workflowRef?: string;
	workflow?: WorkflowConfig;
	workflowFlag?: string;
	pluginFlags?: string[];
	isolationPreset: IsolationPreset;
	ascii?: boolean;
	showSetup?: boolean;
	athenaSessionId: string;
};

type AppPhase =
	| {type: 'setup'}
	| {type: 'session-select'}
	| {type: 'main'; initialSessionId?: string};

type FocusMode = 'feed' | 'input' | 'todo';
type InputMode = 'normal' | 'cmd' | 'search';

function deriveInputMode(value: string): InputMode {
	if (value.startsWith(':')) return 'cmd';
	if (value.startsWith('/')) return 'search';
	return 'normal';
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
	pluginMcpConfig,
	modelName,
	athenaSessionId,
	initialSessionId,
	onClear,
	onShowSessions,
	onShowSetup,
	inputHistory,
	workflowRef,
	workflow,
	ascii,
}: Omit<
	Props,
	| 'showSessionPicker'
	| 'showSetup'
	| 'theme'
	| 'workflowFlag'
	| 'pluginFlags'
	| 'isolationPreset'
> & {
	initialSessionId?: string;
	onClear: () => void;
	onShowSessions: () => void;
	onShowSetup: () => void;
	inputHistory: InputHistory;
}) {
	const [messages, setMessages] = useState<MessageType[]>([]);
	const [focusMode, setFocusMode] = useState<FocusMode>('feed');
	const [inputMode, setInputMode] = useState<InputMode>('normal');
	const [runFilter, setRunFilter] = useState<string>('all');
	const [hintsForced, setHintsForced] = useState<boolean | null>(null);
	const [showRunOverlay, setShowRunOverlay] = useState(false);
	const [errorsOnly, setErrorsOnly] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	const messagesRef = useRef(messages);
	messagesRef.current = messages;

	const theme = useTheme();
	const feedEvents = useHookContextSelector(value => value.feedEvents);
	const feedItems = useHookContextSelector(value => value.items);
	const tasks = useHookContextSelector(value => value.tasks);
	const session = useHookContextSelector(value => value.session);
	const currentRun = useHookContextSelector(value => value.currentRun);
	const currentPermissionRequest = useHookContextSelector(
		value => value.currentPermissionRequest,
	);
	const permissionQueueCount = useHookContextSelector(
		value => value.permissionQueueCount,
	);
	const resolvePermission = useHookContextSelector(
		value => value.resolvePermission,
	);
	const currentQuestionRequest = useHookContextSelector(
		value => value.currentQuestionRequest,
	);
	const questionQueueCount = useHookContextSelector(
		value => value.questionQueueCount,
	);
	const resolveQuestion = useHookContextSelector(
		value => value.resolveQuestion,
	);
	const postByToolUseId = useHookContextSelector(
		value => value.postByToolUseId,
	);
	const allocateSeq = useHookContextSelector(value => value.allocateSeq);
	const clearEvents = useHookContextSelector(value => value.clearEvents);
	const printTaskSnapshot = useHookContextSelector(
		value => value.printTaskSnapshot,
	);
	const recordTokens = useHookContextSelector(value => value.recordTokens);
	const restoredTokens = useHookContextSelector(value => value.restoredTokens);
	const hookCommandFeed = useMemo(
		() => ({printTaskSnapshot}),
		[printTaskSnapshot],
	);

	const currentSessionId = session?.session_id ?? null;
	const sessionScope = useMemo(() => {
		const persisted = getSessionMeta(athenaSessionId)?.adapterSessionIds ?? [];
		const ids = [...persisted];
		if (currentSessionId && !ids.includes(currentSessionId)) {
			ids.push(currentSessionId);
		}
		const total = ids.length;
		const index =
			currentSessionId !== null ? ids.indexOf(currentSessionId) + 1 : null;
		return {
			current: index !== null && index > 0 ? index : null,
			total,
		};
	}, [athenaSessionId, currentSessionId]);
	const currentRunId = currentRun?.run_id ?? null;
	const currentRunStartedAt = currentRun?.started_at ?? null;
	const currentRunPromptPreview = currentRun?.trigger?.prompt_preview;
	const timelineCurrentRun = useMemo(
		() =>
			currentRunId && currentRunStartedAt !== null
				? {
						run_id: currentRunId,
						trigger: {prompt_preview: currentRunPromptPreview},
						started_at: currentRunStartedAt,
					}
				: null,
		[currentRunId, currentRunStartedAt, currentRunPromptPreview],
	);

	const onExitTokens = useCallback(
		(tokens: import('./types/headerMetrics.js').TokenUsage) => {
			if (session?.session_id) {
				recordTokens(session.session_id, tokens);
			}
		},
		[session?.session_id, recordTokens],
	);

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
		workflow,
		{
			initialTokens: restoredTokens,
			onExitTokens,
			trackOutput: false,
			trackStreamingText: false,
			tokenUpdateMs: 250,
		},
	);
	const {exit} = useApp();
	const {stdout} = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalRows = stdout?.rows ?? 24;
	// Avoid writing into the terminal's last column, which can trigger
	// auto-wrap artifacts on some terminals/fonts and break right borders.
	const safeTerminalWidth = Math.max(4, terminalWidth - 1);

	// Hold initialSessionId as intent — consumed on first user prompt submission.
	// Deferred spawn: no Claude process runs until user provides real input.
	const initialSessionRef = useRef(initialSessionId);

	const metrics = useHeaderMetrics(feedEvents);
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
				seq: allocateSeq(),
			};
			setMessages(prev => [...prev, newMessage]);
			return newMessage;
		},
		[allocateSeq],
	);

	const clearScreen = useCallback(() => {
		clearEvents();
		process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
		onClear();
	}, [clearEvents, onClear]);

	// ── Timeline + Todo + Layout ────────────────────────────

	const timeline = useTimeline({
		feedItems,
		feedEvents,
		currentRun: timelineCurrentRun,
		runFilter,
		errorsOnly,
		searchQuery,
		postByToolUseId,
		verbose,
	});
	const {
		runSummaries,
		filteredEntries,
		searchMatches,
		searchMatchSet,
		searchMatchPos,
		setSearchMatchPos,
	} = timeline;

	const todoPanel = useTodoPanel({
		tasks,
		isWorking: appMode.type === 'working',
	});

	useEffect(() => {
		if (
			focusMode === 'todo' &&
			(!todoPanel.todoVisible || todoPanel.visibleTodoItems.length === 0)
		) {
			setFocusMode('feed');
		}
	}, [focusMode, todoPanel.todoVisible, todoPanel.visibleTodoItems.length]);

	const estimatedTodoRows = todoPanel.todoVisible
		? Math.min(8, 2 + todoPanel.visibleTodoItems.length)
		: 0;
	const estimatedRunRows = showRunOverlay
		? Math.min(6, 1 + Math.max(1, runSummaries.length))
		: 0;
	const feedNav = useFeedNavigation({
		filteredEntries,
		feedContentRows: Math.max(
			1,
			terminalRows - 10 - estimatedTodoRows - estimatedRunRows,
		),
	});

	// Compute frame dimensions early (only depends on terminalWidth)
	const frameWidth = safeTerminalWidth;
	const innerWidth = frameWidth - 2;

	// ── Refs for callbacks ──────────────────────────────────

	const filteredEntriesRef = useRef(filteredEntries);
	filteredEntriesRef.current = filteredEntries;
	const runSummariesRef = useRef(runSummaries);
	runSummariesRef.current = runSummaries;

	// ── Prompt submission ───────────────────────────────────

	const submitPromptOrSlashCommand = useCallback(
		(value: string) => {
			if (!value.trim()) return;
			inputHistory.push(value);
			const result = parseInput(value);
			if (result.type === 'prompt') {
				addMessage('user', result.text);
				const sessionToResume = currentSessionId ?? initialSessionRef.current;
				spawnClaude(result.text, sessionToResume ?? undefined).catch(
					(err: unknown) => console.error('[athena] spawn failed:', err),
				);
				// Clear intent after first use — subsequent prompts use currentSessionId from mapper
				if (initialSessionRef.current) {
					initialSessionRef.current = undefined;
				}
				return;
			}
			addMessage('user', value);
			const addMessageObj = (msg: Omit<MessageType, 'seq'>) =>
				setMessages(prev => [...prev, {...msg, seq: allocateSeq()}]);
			const elapsed = metrics.sessionStartTime
				? Math.floor((Date.now() - metrics.sessionStartTime.getTime()) / 1000)
				: 0;
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
					showSetup: onShowSetup,
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
				hook: {args: result.args, feed: hookCommandFeed},
				prompt: {
					spawn: spawnClaude,
					currentSessionId: currentSessionId ?? undefined,
				},
			}).catch((err: unknown) => {
				console.error('[athena] command execution failed:', err);
			});
		},
		[
			inputHistory,
			addMessage,
			allocateSeq,
			spawnClaude,
			currentSessionId,
			exit,
			clearScreen,
			onShowSessions,
			onShowSetup,
			metrics,
			modelName,
			tokenUsage,
			hookCommandFeed,
		],
	);

	// ── Command dispatch ────────────────────────────────────

	const runCommand = useCommandDispatch({
		addMessage,
		todoPanel,
		feedNav,
		setFocusMode,
		setShowRunOverlay,
		setRunFilter,
		setErrorsOnly,
		filteredEntriesRef,
		runSummariesRef,
	});

	// ── Input handling ──────────────────────────────────────

	const setInputValueRef = useRef<(value: string) => void>(() => {});
	const inputValueRef = useRef('');
	const [inputSeed, setInputSeed] = useState<{value: string; rev: number}>({
		value: '',
		rev: 0,
	});

	const syncInputModeFromValue = useCallback((value: string) => {
		const nextMode = deriveInputMode(value);
		setInputMode(prev => (prev === nextMode ? prev : nextMode));
		if (value.length === 0) {
			setSearchQuery('');
		}
	}, []);

	const setInputValueProgrammatically = useCallback(
		(value: string) => {
			inputValueRef.current = value;
			syncInputModeFromValue(value);
			setInputSeed(prev => ({value, rev: prev.rev + 1}));
		},
		[syncInputModeFromValue],
	);
	setInputValueRef.current = setInputValueProgrammatically;

	const handleInputSubmit = useCallback(
		(rawValue: string) => {
			const trimmed = rawValue.trim();
			const resetInput = () => {
				setInputValueRef.current('');
				setInputMode('normal');
				setFocusMode('feed');
			};
			if (!trimmed) {
				resetInput();
				return;
			}
			if (trimmed.startsWith(':') || inputMode === 'cmd') {
				runCommand(trimmed.startsWith(':') ? trimmed : `:${trimmed}`);
				resetInput();
				return;
			}
			const parsedSlash = parseInput(trimmed);
			if (parsedSlash.type === 'command') {
				submitPromptOrSlashCommand(trimmed);
				resetInput();
				return;
			}
			if (trimmed.startsWith('/') || inputMode === 'search') {
				const query = trimmed.replace(/^\//, '').trim();
				setSearchQuery(query);
				if (query.length > 0) {
					const q = query.toLowerCase();
					const firstIdx = filteredEntriesRef.current.findIndex(e =>
						e.searchText.toLowerCase().includes(q),
					);
					if (firstIdx >= 0) {
						feedNav.setFeedCursor(firstIdx);
						feedNav.setTailFollow(false);
						setSearchMatchPos(0);
					}
				}
				resetInput();
				return;
			}
			submitPromptOrSlashCommand(trimmed);
			resetInput();
		},
		[
			inputMode,
			runCommand,
			submitPromptOrSlashCommand,
			feedNav,
			setSearchMatchPos,
		],
	);

	const handleMainInputChange = useCallback(
		(value: string) => {
			inputValueRef.current = value;
			syncInputModeFromValue(value);
		},
		[syncInputModeFromValue],
	);

	const handleMainInputSubmit = useCallback(
		(value: string) => {
			if (value.endsWith('\\')) {
				setInputValueProgrammatically(value.slice(0, -1) + '\n');
				return;
			}
			handleInputSubmit(value);
		},
		[handleInputSubmit, setInputValueProgrammatically],
	);

	// ── Frame lines + Layout ────────────────────────────────

	// Derive last run status for contextual input prompt (X2)
	const lastRunStatus = useMemo(() => {
		if (isClaudeRunning) return null;
		const last = runSummaries[runSummaries.length - 1];
		if (!last) return null;
		if (last.status === 'SUCCEEDED') return 'completed' as const;
		if (last.status === 'FAILED') return 'failed' as const;
		if (last.status === 'CANCELLED') return 'aborted' as const;
		return null;
	}, [isClaudeRunning, runSummaries]);

	const frameExpandedEntry = useMemo(
		() =>
			feedNav.expandedId
				? (filteredEntries.find(entry => entry.id === feedNav.expandedId) ??
					null)
				: null,
		[feedNav.expandedId, filteredEntries],
	);

	const frame = useMemo(
		() =>
			buildFrameLines({
				innerWidth,
				focusMode,
				inputMode,
				searchQuery,
				searchMatches,
				searchMatchPos,
				expandedEntry: frameExpandedEntry,
				isClaudeRunning,
				inputValue: '',
				cursorOffset: 0,
				dialogActive,
				dialogType: appMode.type,
				accentColor: theme.inputPrompt,
				hintsForced,
				ascii: !!ascii,
				lastRunStatus,
				skipInputLines: true,
			}),
		[
			innerWidth,
			focusMode,
			inputMode,
			searchQuery,
			searchMatches,
			searchMatchPos,
			frameExpandedEntry,
			isClaudeRunning,
			dialogActive,
			appMode.type,
			theme.inputPrompt,
			hintsForced,
			ascii,
			lastRunStatus,
		],
	);

	const footerRows = (frame.footerHelp !== null ? 1 : 0) + 1;

	const layout = useLayout({
		terminalRows,
		terminalWidth: safeTerminalWidth,
		showRunOverlay,
		runSummaries,
		filteredEntries,
		feedNav,
		todoPanel,
		footerRows,
	});

	const {
		feedHeaderRows,
		feedContentRows,
		actualTodoRows,
		actualRunOverlayRows,
		pageStep,
		detailPageStep,
		maxDetailScroll,
		detailLines,
		detailShowLineNumbers,
		detailContentRows,
		expandedEntry,
	} = layout;

	const fr = useMemo(() => frameGlyphs(!!ascii), [ascii]);
	const {topBorder, bottomBorder, sectionBorder} = useMemo(
		() => ({
			topBorder: `${fr.topLeft}${fr.horizontal.repeat(innerWidth)}${fr.topRight}`,
			bottomBorder: `${fr.bottomLeft}${fr.horizontal.repeat(innerWidth)}${fr.bottomRight}`,
			sectionBorder: `${fr.teeLeft}${fr.horizontal.repeat(innerWidth)}${fr.teeRight}`,
		}),
		[fr, innerWidth],
	);
	const frameLine = useCallback(
		(content: string): string =>
			`${fr.vertical}${fitAnsi(content, innerWidth)}${fr.vertical}`,
		[fr.vertical, innerWidth],
	);

	// ── Focus cycling ───────────────────────────────────────

	const visibleTodoItemsRef = useRef(todoPanel.visibleTodoItems);
	visibleTodoItemsRef.current = todoPanel.visibleTodoItems;

	const cycleFocus = useCallback(() => {
		setFocusMode(prev => {
			if (prev === 'feed') return 'input';
			if (prev === 'input') {
				if (todoPanel.todoVisible && visibleTodoItemsRef.current.length > 0)
					return 'todo';
				feedNav.jumpToTail();
				return 'feed';
			}
			feedNav.jumpToTail();
			return 'feed';
		});
	}, [todoPanel.todoVisible, feedNav]);

	// ── Permission/question handlers ────────────────────────

	const handlePermissionDecision = useCallback(
		(decision: PermissionDecision) => {
			if (!currentPermissionRequest) return;
			resolvePermission(currentPermissionRequest.request_id, decision);
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

	// ── Keyboard hooks ──────────────────────────────────────

	useInput(
		(input, key) => {
			const done = startInputMeasure('app.global', input, key);
			try {
				if (dialogActive) return;
				if (key.escape && isClaudeRunning) {
					sendInterrupt();
					return;
				}
				if (key.ctrl && input === 't') {
					todoPanel.setTodoVisible(v => !v);
					if (focusMode === 'todo') setFocusMode('feed');
					return;
				}
				if (key.ctrl && input === '/') {
					setHintsForced(prev => (prev === null ? true : prev ? false : null));
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
				}
			} finally {
				done();
			}
		},
		{isActive: !dialogActive},
	);

	useFeedKeyboard({
		isActive: focusMode === 'feed' && !dialogActive,
		escapeHandledExternally: isClaudeRunning,
		expandedEntry,
		expandedId: feedNav.expandedId,
		pageStep,
		detailPageStep,
		maxDetailScroll,
		searchMatches,
		callbacks: {
			moveFeedCursor: feedNav.moveFeedCursor,
			jumpToTail: feedNav.jumpToTail,
			jumpToTop: feedNav.jumpToTop,
			toggleExpandedAtCursor: feedNav.toggleExpandedAtCursor,
			scrollDetail: feedNav.scrollDetail,
			cycleFocus,
			setFocusMode,
			setInputMode,
			setInputValue: (v: string) => setInputValueRef.current(v),
			setExpandedId: feedNav.setExpandedId,
			setShowRunOverlay,
			setSearchQuery,
			setSearchMatchPos,
			setFeedCursor: feedNav.setFeedCursor,
			setTailFollow: feedNav.setTailFollow,
			setDetailScroll: feedNav.setDetailScroll,
		},
	});

	useTodoKeyboard({
		isActive: focusMode === 'todo' && !dialogActive,
		escapeHandledExternally: isClaudeRunning,
		todoCursor: todoPanel.todoCursor,
		visibleTodoItems: todoPanel.visibleTodoItems,
		filteredEntries,
		callbacks: {
			setFocusMode,
			setInputMode,
			setInputValue: (v: string) => setInputValueRef.current(v),
			setTodoCursor: todoPanel.setTodoCursor,
			setFeedCursor: feedNav.setFeedCursor,
			setTailFollow: feedNav.setTailFollow,
			toggleTodoStatus: todoPanel.toggleTodoStatus,
			cycleFocus,
		},
	});

	const hasColor = !process.env['NO_COLOR'];
	const useAscii = !!ascii;
	const spinnerFrame = useSpinner(
		appMode.type === 'working' &&
			todoPanel.todoVisible &&
			feedNav.expandedId === null,
	);

	const todoColors = useMemo(
		() => ({
			doing: theme.status.warning,
			done: theme.textMuted,
			failed: theme.status.error,
			blocked: theme.status.warning,
			text: theme.text,
			textMuted: theme.textMuted,
			default: theme.status.neutral,
		}),
		[theme],
	);

	const sessionId = session?.session_id;
	const sessionAgentType = session?.agent_type;
	const headerLine1 = useMemo(() => {
		const headerModel = buildHeaderModel({
			session: session
				? {
						session_id: sessionId,
						agent_type: sessionAgentType,
					}
				: null,
			currentRun: timelineCurrentRun,
			runSummaries,
			metrics: {
				failures: metrics.failures,
				blocks: metrics.blocks,
			},
			todoPanel: {
				doneCount: todoPanel.doneCount,
				doingCount: todoPanel.doingCount,
				todoItems: {length: todoPanel.todoItems.length},
			},
			tailFollow: feedNav.tailFollow,
			now: 0,
			workflowRef,
			contextUsed: tokenUsage.contextSize,
			contextMax: 200000,
			sessionIndex: sessionScope.current,
			sessionTotal: sessionScope.total,
		});
		return renderHeaderLines(headerModel, innerWidth, hasColor)[0];
	}, [
		session,
		sessionId,
		sessionAgentType,
		timelineCurrentRun,
		runSummaries,
		metrics.failures,
		metrics.blocks,
		todoPanel.doneCount,
		todoPanel.doingCount,
		todoPanel.todoItems.length,
		feedNav.tailFollow,
		workflowRef,
		tokenUsage.contextSize,
		sessionScope.current,
		sessionScope.total,
		innerWidth,
		hasColor,
	]);

	// ── Body lines ──────────────────────────────────────────

	const prefixBodyLines = useMemo(
		() =>
			buildBodyLines({
				innerWidth,
				detail: expandedEntry
					? {
							expandedEntry,
							detailScroll: feedNav.detailScroll,
							maxDetailScroll,
							detailLines,
							detailContentRows,
							showLineNumbers: detailShowLineNumbers,
						}
					: null,
				todo: {
					actualTodoRows,
					todoPanel: {
						todoScroll: todoPanel.todoScroll,
						todoCursor: todoPanel.todoCursor,
						visibleTodoItems: todoPanel.visibleTodoItems,
					},
					focusMode,
					ascii: useAscii,
					colors: todoColors,
					appMode: appMode.type,
					doneCount: todoPanel.doneCount,
					totalCount: todoPanel.todoItems.length,
					spinnerFrame,
				},
				runOverlay: {actualRunOverlayRows, runSummaries, runFilter},
				theme,
			}),
		[
			innerWidth,
			expandedEntry,
			feedNav.detailScroll,
			maxDetailScroll,
			detailLines,
			detailContentRows,
			detailShowLineNumbers,
			actualTodoRows,
			todoPanel.todoScroll,
			todoPanel.todoCursor,
			todoPanel.visibleTodoItems,
			focusMode,
			useAscii,
			todoColors,
			appMode.type,
			todoPanel.doneCount,
			todoPanel.todoItems.length,
			spinnerFrame,
			actualRunOverlayRows,
			runSummaries,
			runFilter,
			theme,
		],
	);

	const feedCols = useFeedColumns(filteredEntries, innerWidth);
	const showFeedGrid = !expandedEntry;
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
				: lastRunStatus === 'completed'
					? 'Run complete - type a follow-up or :retry'
					: lastRunStatus === 'failed' || lastRunStatus === 'aborted'
						? 'Run failed - type a follow-up or :retry'
						: 'Type a prompt or :command';
	const dialogPlaceholder =
		appMode.type === 'question'
			? 'Answer question in dialog...'
			: 'Respond to permission dialog...';
	const textInputPlaceholder = dialogActive
		? dialogPlaceholder
		: inputPlaceholder;

	// ── Render ──────────────────────────────────────────────

	return (
		<Box flexDirection="column" width={frameWidth}>
			<Text>{topBorder}</Text>
			<Text>{frameLine(headerLine1)}</Text>
			<Text>{sectionBorder}</Text>
			{prefixBodyLines.map((line, index) => (
				<Text key={`body-${index}`}>{frameLine(line)}</Text>
			))}
			{showFeedGrid && (
				<FeedGrid
					feedHeaderRows={feedHeaderRows}
					feedContentRows={feedContentRows}
					feedViewportStart={feedNav.feedViewportStart}
					filteredEntries={filteredEntries}
					feedCursor={feedNav.feedCursor}
					expandedId={feedNav.expandedId}
					focusMode={focusMode}
					searchMatchSet={searchMatchSet}
					ascii={useAscii}
					theme={theme}
					innerWidth={innerWidth}
					cols={feedCols}
				/>
			)}
			<Text>{sectionBorder}</Text>
			{frame.footerHelp !== null && (
				<Text>{frameLine(fit(frame.footerHelp, innerWidth))}</Text>
			)}
			<FrameRow innerWidth={innerWidth} ascii={useAscii}>
				<Box width={inputPrefix.length} flexShrink={0}>
					<Text color={theme.inputPrompt}>{inputPrefix}</Text>
				</Box>
				<Box width={inputContentWidth} flexShrink={0}>
					<TextInput
						key={`app-main-input-${inputSeed.rev}`}
						defaultValue={inputSeed.value}
						placeholder={textInputPlaceholder}
						isDisabled={focusMode !== 'input' || dialogActive}
						onChange={handleMainInputChange}
						onSubmit={handleMainInputSubmit}
					/>
				</Box>
				<Box width={badgeText.length} flexShrink={0}>
					<Text>{badgeText}</Text>
				</Box>
			</FrameRow>
			<Text>{bottomBorder}</Text>
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
	showSetup,
	workflowRef,
	workflow,
	workflowFlag,
	pluginFlags,
	isolationPreset,
	ascii,
	athenaSessionId: initialAthenaSessionId,
}: Props) {
	const [clearCount, setClearCount] = useState(0);
	const perfEnabled = isPerfEnabled();
	const [athenaSessionId, setAthenaSessionId] = useState(
		initialAthenaSessionId,
	);
	const [activeTheme, setActiveTheme] = useState(theme);
	const [runtimeState, setRuntimeState] = useState<{
		isolation?: IsolationConfig;
		pluginMcpConfig?: string;
		modelName: string | null;
		workflowRef?: string;
		workflow?: WorkflowConfig;
	}>({
		isolation,
		pluginMcpConfig,
		modelName,
		workflowRef,
		workflow,
	});
	const inputHistory = useInputHistory(projectDir);
	const initialPhase: AppPhase = showSetup
		? {type: 'setup'}
		: showSessionPicker
			? {type: 'session-select'}
			: {type: 'main', initialSessionId};
	const [phase, setPhase] = useState<AppPhase>(initialPhase);

	useEffect(() => {
		if (!perfEnabled) return;
		logPerfEvent('app.start', {
			project_dir: projectDir,
			instance_id: instanceId,
		});
		return startEventLoopMonitor('app');
	}, [perfEnabled, projectDir, instanceId]);

	useEffect(() => {
		if (!perfEnabled) return;
		logPerfEvent('app.phase', {phase: phase.type});
	}, [perfEnabled, phase.type]);

	const handleProfilerRender = useCallback(
		(
			id: string,
			phaseName: string,
			actualDuration: number,
			baseDuration: number,
			startTime: number,
			commitTime: number,
		) => {
			logReactCommit(
				id,
				phaseName,
				actualDuration,
				baseDuration,
				startTime,
				commitTime,
			);
		},
		[],
	);

	const withProfiler = (id: string, node: React.ReactElement) =>
		perfEnabled ? (
			<Profiler id={id} onRender={handleProfilerRender}>
				{node}
			</Profiler>
		) : (
			node
		);

	const handleSessionSelect = useCallback((sessionId: string) => {
		// sessionId here is an athena session ID from the picker.
		// Look up the most recent adapter (Claude) session ID for spawnClaude.
		const meta = getSessionMeta(sessionId);
		const adapterIds = meta?.adapterSessionIds ?? [];
		const lastAdapterId = adapterIds[adapterIds.length - 1];

		setAthenaSessionId(sessionId);
		setPhase({type: 'main', initialSessionId: lastAdapterId});
	}, []);
	const handleSessionCancel = useCallback(() => {
		setPhase({type: 'main'});
	}, []);
	const handleShowSessions = useCallback(() => {
		setPhase({type: 'session-select'});
	}, []);
	const handleShowSetup = useCallback(() => {
		setPhase({type: 'setup'});
	}, []);
	const sessions = useMemo((): SessionEntry[] => {
		if (phase.type !== 'session-select') return [];
		// Use athena sessions, mapped to SessionEntry format for the picker
		const athenaSessions = listSessions(projectDir);
		return athenaSessions.map(s => ({
			sessionId: s.id,
			summary: s.label ?? '',
			firstPrompt: `Session ${s.id.slice(0, 8)}`,
			modified: new Date(s.updatedAt).toISOString(),
			created: new Date(s.createdAt).toISOString(),
			gitBranch: '',
			messageCount: s.eventCount ?? s.adapterSessionIds.length,
		}));
	}, [projectDir, phase]);

	if (phase.type === 'setup') {
		return withProfiler(
			'app.setup',
			<ThemeProvider value={activeTheme}>
				<SetupWizard
					onThemePreview={themeName => {
						setActiveTheme(resolveTheme(themeName));
					}}
					onComplete={setupResult => {
						setActiveTheme(resolveTheme(setupResult.theme));
						try {
							const refreshed = bootstrapRuntimeConfig({
								projectDir,
								showSetup: false,
								workflowFlag,
								pluginFlags,
								isolationPreset,
								verbose,
							});
							for (const warning of refreshed.warnings) {
								console.error(warning);
							}
							setRuntimeState({
								isolation: refreshed.isolationConfig,
								pluginMcpConfig: refreshed.pluginMcpConfig,
								modelName: refreshed.modelName,
								workflowRef: refreshed.workflowRef,
								workflow: refreshed.workflow,
							});
						} catch (error) {
							console.error(`Error: ${(error as Error).message}`);
						}
						setPhase({type: 'main'});
					}}
				/>
			</ThemeProvider>,
		);
	}

	if (phase.type === 'session-select') {
		return withProfiler(
			'app.session-select',
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
			</ErrorBoundary>,
		);
	}

	return withProfiler(
		'app.main',
		<ThemeProvider value={activeTheme}>
			<HookProvider
				projectDir={projectDir}
				instanceId={instanceId}
				allowedTools={runtimeState.isolation?.allowedTools}
				athenaSessionId={athenaSessionId}
			>
				<AppContent
					key={clearCount}
					projectDir={projectDir}
					instanceId={instanceId}
					isolation={runtimeState.isolation}
					verbose={verbose}
					version={version}
					pluginMcpConfig={runtimeState.pluginMcpConfig}
					modelName={runtimeState.modelName}
					athenaSessionId={athenaSessionId}
					initialSessionId={phase.initialSessionId}
					onClear={() => setClearCount(c => c + 1)}
					onShowSessions={handleShowSessions}
					onShowSetup={handleShowSetup}
					inputHistory={inputHistory}
					workflowRef={runtimeState.workflowRef}
					workflow={runtimeState.workflow}
					ascii={ascii}
				/>
			</HookProvider>
		</ThemeProvider>,
	);
}
