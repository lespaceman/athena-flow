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
import {useFeedNavigation} from './hooks/useFeedNavigation.js';
import {useTodoPanel} from './hooks/useTodoPanel.js';
import {useFeedKeyboard} from './hooks/useFeedKeyboard.js';
import {useTodoKeyboard} from './hooks/useTodoKeyboard.js';
import {useTimeline} from './hooks/useTimeline.js';
import {useLayout} from './hooks/useLayout.js';
import {useCommandDispatch} from './hooks/useCommandDispatch.js';
import {buildBodyLines} from './utils/buildBodyLines.js';
import {buildFrameLines} from './utils/buildFrameLines.js';
import {buildHeaderModel} from './utils/headerModel.js';
import {renderHeaderLines} from './utils/renderHeaderLines.js';
import {
	type Message as MessageType,
	type IsolationConfig,
	generateId,
} from './types/index.js';
import {type PermissionDecision} from './types/server.js';
import {parseInput} from './commands/parser.js';
import {executeCommand} from './commands/executor.js';
import {ThemeProvider, useTheme, type Theme} from './theme/index.js';
import SessionPicker from './components/SessionPicker.js';
import type {SessionEntry} from './utils/sessionIndex.js';
import {listSessions, getSessionMeta} from './sessions/registry.js';
import {fit, fitAnsi} from './utils/format.js';
import {frameGlyphs} from './glyphs/index.js';
import type {WorkflowConfig} from './workflows/types.js';
import SetupWizard from './setup/SetupWizard.js';

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
	'showSessionPicker' | 'showSetup' | 'theme' | 'athenaSessionId'
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
	const [showRunOverlay, setShowRunOverlay] = useState(false);
	const [errorsOnly, setErrorsOnly] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	const messagesRef = useRef(messages);
	messagesRef.current = messages;

	const theme = useTheme();
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
		postByToolUseId,
		allocateSeq,
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
		workflow,
	);
	const {exit} = useApp();
	const {stdout} = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const terminalRows = stdout?.rows ?? 24;

	// Hold initialSessionId as intent — consumed on first user prompt submission.
	// Deferred spawn: no Claude process runs until user provides real input.
	const initialSessionRef = useRef(initialSessionId);

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
				seq: allocateSeq(),
			};
			setMessages(prev => [...prev, newMessage]);
			return newMessage;
		},
		[allocateSeq],
	);

	const clearScreen = useCallback(() => {
		hookServer.clearEvents();
		process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
		onClear();
	}, [hookServer, onClear]);

	// ── Timeline + Todo + Layout ────────────────────────────

	const timeline = useTimeline({
		feedItems,
		feedEvents,
		currentRun: currentRun
			? {
					run_id: currentRun.run_id,
					trigger: currentRun.trigger,
					started_at: currentRun.started_at,
				}
			: null,
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

	const todoPanel = useTodoPanel({tasks, todoVisible: true, focusMode});

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

	const layout = useLayout({
		terminalRows,
		terminalWidth,
		showRunOverlay,
		runSummaries,
		filteredEntries,
		feedNav,
		todoPanel,
	});

	const {
		frameWidth,
		innerWidth,
		bodyHeight,
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

	const fr = frameGlyphs(!!ascii);
	const topBorder = `${fr.topLeft}${fr.horizontal.repeat(innerWidth)}${fr.topRight}`;
	const bottomBorder = `${fr.bottomLeft}${fr.horizontal.repeat(innerWidth)}${fr.bottomRight}`;
	const sectionBorder = `${fr.teeLeft}${fr.horizontal.repeat(innerWidth)}${fr.teeRight}`;
	const frameLine = (content: string): string =>
		`${fr.vertical}${fitAnsi(content, innerWidth)}${fr.vertical}`;

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
				spawnClaude(result.text, sessionToResume ?? undefined);
				// Clear intent after first use — subsequent prompts use currentSessionId from mapper
				if (initialSessionRef.current) {
					initialSessionRef.current = undefined;
				}
				return;
			}
			addMessage('user', value);
			const addMessageObj = (msg: Omit<MessageType, 'seq'>) =>
				setMessages(prev => [...prev, {...msg, seq: allocateSeq()}]);
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
				hook: {args: result.args, feed: hookServer},
				prompt: {
					spawn: spawnClaude,
					currentSessionId: currentSessionId ?? undefined,
				},
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
			metrics,
			modelName,
			tokenUsage,
			elapsed,
			hookServer,
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

	// ── Focus cycling ───────────────────────────────────────

	const visibleTodoItemsRef = useRef(todoPanel.visibleTodoItems);
	visibleTodoItemsRef.current = todoPanel.visibleTodoItems;

	const cycleFocus = useCallback(() => {
		setFocusMode(prev => {
			if (prev === 'feed') return 'input';
			if (prev === 'input') {
				if (todoPanel.todoVisible && visibleTodoItemsRef.current.length > 0)
					return 'todo';
				return 'feed';
			}
			return 'feed';
		});
	}, [todoPanel.todoVisible]);

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
			if (dialogActive) return;
			if (key.ctrl && input === 't') {
				todoPanel.setTodoVisible(v => !v);
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
			}
		},
		{isActive: !dialogActive},
	);

	useFeedKeyboard({
		isActive: focusMode === 'feed' && !dialogActive,
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

	// ── Frame lines ─────────────────────────────────────────

	const frame = buildFrameLines({
		innerWidth,
		focusMode,
		inputMode,
		searchQuery,
		searchMatches,
		searchMatchPos,
		expandedEntry,
		isClaudeRunning,
		inputValue,
		cursorOffset,
		dialogActive,
		dialogType: appMode.type,
	});

	const hasColor = !process.env['NO_COLOR'];
	const useAscii = !!ascii;
	const now = Date.now();
	const headerModel = buildHeaderModel({
		session,
		currentRun: currentRun
			? {
					run_id: currentRun.run_id,
					trigger: currentRun.trigger,
					started_at: currentRun.started_at,
				}
			: null,
		runSummaries,
		metrics: {
			failures: metrics.failures,
			blocks: metrics.blocks,
		},
		todoPanel,
		tailFollow: feedNav.tailFollow,
		now,
		workflowRef,
		contextUsed: tokenUsage.contextSize,
		contextMax: 200000,
	});
	const [headerLine1] = renderHeaderLines(
		headerModel,
		innerWidth,
		hasColor,
		now,
	);

	// ── Body lines ──────────────────────────────────────────

	const clippedBodyLines = buildBodyLines({
		innerWidth,
		bodyHeight,
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
		feed: {
			feedHeaderRows,
			feedContentRows,
			feedViewportStart: feedNav.feedViewportStart,
			visibleFeedEntries: feedNav.visibleFeedEntries,
			filteredEntries,
			feedCursor: feedNav.feedCursor,
			expandedId: feedNav.expandedId,
			focusMode,
			searchMatchSet,
		},
		todo: {
			actualTodoRows,
			todoPanel: {
				todoScroll: todoPanel.todoScroll,
				todoCursor: todoPanel.todoCursor,
				remainingCount: todoPanel.remainingCount,
				visibleTodoItems: todoPanel.visibleTodoItems,
			},
			focusMode,
			ascii: useAscii,
			colors: {
				doing: theme.status.warning,
				done: theme.status.success,
				default: theme.status.neutral,
			},
		},
		runOverlay: {actualRunOverlayRows, runSummaries, runFilter},
		theme,
	});

	// ── Render ──────────────────────────────────────────────

	return (
		<Box flexDirection="column" width={frameWidth}>
			<Text>{topBorder}</Text>
			<Text>{frameLine(headerLine1)}</Text>
			<Text>{sectionBorder}</Text>
			{clippedBodyLines.map((line, index) => (
				<Text key={`body-${index}`}>{frameLine(line)}</Text>
			))}
			<Text>{sectionBorder}</Text>
			<Text>{frameLine(fit(frame.footerHelp, innerWidth))}</Text>
			<Text>{frameLine(frame.inputLine)}</Text>
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
	ascii,
	athenaSessionId: initialAthenaSessionId,
}: Props) {
	const [clearCount, setClearCount] = useState(0);
	const [athenaSessionId, setAthenaSessionId] = useState(
		initialAthenaSessionId,
	);
	const inputHistory = useInputHistory(projectDir);
	const initialPhase: AppPhase = showSetup
		? {type: 'setup'}
		: showSessionPicker
			? {type: 'session-select'}
			: {type: 'main', initialSessionId};
	const [phase, setPhase] = useState<AppPhase>(initialPhase);

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
		return (
			<ThemeProvider value={theme}>
				<SetupWizard
					onComplete={() => {
						setPhase({type: 'main'});
					}}
				/>
			</ThemeProvider>
		);
	}

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
			<HookProvider
				projectDir={projectDir}
				instanceId={instanceId}
				allowedTools={isolation?.allowedTools}
				athenaSessionId={athenaSessionId}
			>
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
					onShowSetup={handleShowSetup}
					inputHistory={inputHistory}
					workflowRef={workflowRef}
					workflow={workflow}
					ascii={ascii}
				/>
			</HookProvider>
		</ThemeProvider>
	);
}
