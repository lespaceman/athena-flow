// source/hooks/useFeed.ts

import {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import type {Runtime, RuntimeEvent, RuntimeDecision} from '../runtime/types.js';
import type {FeedEvent} from '../feed/types.js';
import type {SessionStore} from '../sessions/store.js';
import type {Session, Run, Actor} from '../feed/entities.js';
import type {HookRule} from '../types/rules.js';
import type {PermissionDecision} from '../types/server.js';
import type {Message} from '../types/common.js';
import type {TokenUsage} from '../types/headerMetrics.js';
import type {TodoItem, TodoWriteInput} from '../types/todo.js';
import {createFeedMapper, type FeedMapper} from '../feed/mapper.js';
import {shouldExcludeFromFeed} from '../feed/filter.js';
import {handleEvent, type ControllerCallbacks} from './hookController.js';
import type {LoopManager} from '../workflows/loopManager.js';
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_EVENTS = 200;

// ── Types ────────────────────────────────────────────────

export type FeedItem =
	| {type: 'message'; data: Message}
	| {type: 'feed'; data: FeedEvent};

/** Merge messages and feed events into a single sorted list by seq. */
export function mergeFeedItems(
	messages: Message[],
	feedEvents: FeedEvent[],
): FeedItem[] {
	const messageItems: FeedItem[] = messages.map(m => ({
		type: 'message' as const,
		data: m,
	}));
	const feedItems: FeedItem[] = feedEvents
		.filter(e => !shouldExcludeFromFeed(e))
		.map(e => ({type: 'feed' as const, data: e}));

	return [...messageItems, ...feedItems].sort((a, b) => {
		if (a.data.seq !== b.data.seq) return a.data.seq - b.data.seq;
		// Tie-break: messages before feed events at same seq
		if (a.type === 'message' && b.type !== 'message') return -1;
		if (a.type !== 'message' && b.type === 'message') return 1;
		return 0;
	});
}

export type PermissionQueueItem = {
	request_id: string;
	ts: number;
	hookName: string;
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_use_id?: string;
	suggestions?: unknown;
};

export function extractPermissionSnapshot(
	event: RuntimeEvent,
): PermissionQueueItem {
	const p = event.payload as Record<string, unknown>;
	return {
		request_id: event.id,
		ts: event.timestamp,
		hookName: event.hookName,
		tool_name: event.toolName ?? (p.tool_name as string) ?? 'Unknown',
		tool_input: (p.tool_input as Record<string, unknown>) ?? {},
		tool_use_id: event.toolUseId ?? (p.tool_use_id as string | undefined),
		suggestions: p.permission_suggestions,
	};
}

export type UseFeedResult = {
	items: FeedItem[];
	feedEvents: FeedEvent[];
	tasks: TodoItem[];
	session: Session | null;
	currentRun: Run | null;
	actors: Actor[];
	isServerRunning: boolean;

	currentPermissionRequest: PermissionQueueItem | null;
	permissionQueueCount: number;
	resolvePermission: (eventId: string, decision: PermissionDecision) => void;

	currentQuestionRequest: FeedEvent | null;
	questionQueueCount: number;
	resolveQuestion: (eventId: string, answers: Record<string, string>) => void;

	resetSession: () => void;
	clearEvents: () => void;
	rules: HookRule[];
	addRule: (rule: Omit<HookRule, 'id'>) => void;
	removeRule: (id: string) => void;
	clearRules: () => void;
	printTaskSnapshot: () => void;
	isDegraded: boolean;
	postByToolUseId: Map<string, FeedEvent>;
	allocateSeq: () => number;
	recordTokens: (adapterSessionId: string, tokens: TokenUsage) => void;
	restoredTokens: TokenUsage | null;
	setLoopManager: (mgr: LoopManager | null) => void;
};

/** Build a lookup index: tool_use_id → post/failure FeedEvent */
export function buildPostByToolUseId(
	events: FeedEvent[],
): Map<string, FeedEvent> {
	const map = new Map<string, FeedEvent>();
	for (const e of events) {
		if (e.kind !== 'tool.post' && e.kind !== 'tool.failure') continue;
		const toolUseId = e.data.tool_use_id;
		if (toolUseId) map.set(toolUseId, e);
	}
	return map;
}

// ── Hook ─────────────────────────────────────────────────

function buildInitialRules(allowedTools?: string[]): HookRule[] {
	if (!allowedTools || allowedTools.length === 0) return [];
	return allowedTools.map((toolName, i) => ({
		id: `init-${i}`,
		toolName,
		action: 'approve' as const,
		addedBy: 'allowedTools',
	}));
}

export function useFeed(
	runtime: Runtime,
	messages: Message[] = [],
	initialAllowedTools?: string[],
	sessionStore?: SessionStore,
): UseFeedResult {
	// Restore stored session data on mount (if resuming)
	const mapperBootstrap = useMemo(
		() => sessionStore?.toBootstrap(),
		[sessionStore],
	);

	const [feedEvents, setFeedEvents] = useState<FeedEvent[]>(
		() => mapperBootstrap?.feedEvents ?? [],
	);
	const [rules, setRules] = useState<HookRule[]>(() =>
		buildInitialRules(initialAllowedTools),
	);
	const [permissionQueue, setPermissionQueue] = useState<PermissionQueueItem[]>(
		[],
	);
	const [questionQueue, setQuestionQueue] = useState<string[]>([]);

	const restoredTokens = useMemo(
		() => sessionStore?.getRestoredTokens() ?? null,
		[sessionStore],
	);

	const mapperRef = useRef<FeedMapper>(createFeedMapper(mapperBootstrap));
	const sessionStoreRef = useRef<SessionStore | undefined>(sessionStore);
	const rulesRef = useRef<HookRule[]>([]);
	const abortRef = useRef<AbortController>(new AbortController());
	const loopManagerRef = useRef<LoopManager | null>(null);
	const feedEventsRef = useRef<FeedEvent[]>([]);

	rulesRef.current = rules;
	feedEventsRef.current = feedEvents;

	const resetSession = useCallback(() => {
		// Reset mapper state — create fresh mapper
		mapperRef.current = createFeedMapper();
	}, []);

	const addRule = useCallback((rule: Omit<HookRule, 'id'>) => {
		const newRule: HookRule = {...rule, id: generateId()};
		setRules(prev => [...prev, newRule]);
	}, []);

	const removeRule = useCallback((id: string) => {
		setRules(prev => prev.filter(r => r.id !== id));
	}, []);

	const clearRules = useCallback(() => setRules([]), []);
	const clearEvents = useCallback(() => setFeedEvents([]), []);

	const recordTokens = useCallback(
		(adapterSessionId: string, tokens: TokenUsage) => {
			if (!sessionStoreRef.current) return;
			try {
				sessionStoreRef.current.recordTokens(adapterSessionId, tokens);
			} catch (err) {
				sessionStoreRef.current.markDegraded(
					`recordTokens failed: ${err instanceof Error ? err.message : err}`,
				);
			}
		},
		[],
	);

	// Queue helpers
	const enqueuePermission = useCallback((event: RuntimeEvent) => {
		const snapshot = extractPermissionSnapshot(event);
		setPermissionQueue(prev => [...prev, snapshot]);
	}, []);

	const dequeuePermission = useCallback((requestId: string) => {
		setPermissionQueue(prev =>
			prev.filter(item => item.request_id !== requestId),
		);
	}, []);

	const enqueueQuestion = useCallback((requestId: string) => {
		setQuestionQueue(prev => [...prev, requestId]);
	}, []);

	const dequeueQuestion = useCallback((requestId: string) => {
		setQuestionQueue(prev => prev.filter(id => id !== requestId));
	}, []);

	const currentPermissionRequest = useMemo(
		() => (permissionQueue.length > 0 ? permissionQueue[0]! : null),
		[permissionQueue],
	);

	const currentQuestionRequest = useMemo(() => {
		if (questionQueue.length === 0) return null;
		return (
			feedEvents.find(
				e =>
					e.kind === 'tool.pre' &&
					e.data.tool_name === 'AskUserQuestion' &&
					e.cause?.hook_request_id === questionQueue[0],
			) ?? null
		);
	}, [feedEvents, questionQueue]);

	const resolvePermission = useCallback(
		(requestId: string, decision: PermissionDecision) => {
			const isAllow = decision !== 'deny' && decision !== 'always-deny';

			const queueItem = permissionQueue.find(
				item => item.request_id === requestId,
			);
			const toolName = queueItem?.tool_name;
			if (toolName) {
				if (decision === 'always-allow') {
					addRule({toolName, action: 'approve', addedBy: 'permission-dialog'});
				} else if (decision === 'always-deny') {
					addRule({toolName, action: 'deny', addedBy: 'permission-dialog'});
				} else if (decision === 'always-allow-server') {
					const serverMatch = /^(mcp__[^_]+(?:_[^_]+)*__)/.exec(toolName);
					if (serverMatch) {
						addRule({
							toolName: serverMatch[1] + '*',
							action: 'approve',
							addedBy: 'permission-dialog',
						});
					}
				}
			}

			// Use PreToolUse intents for PreToolUse events, PermissionRequest intents otherwise
			const isPreToolUse = queueItem?.hookName === 'PreToolUse';
			const runtimeDecision: RuntimeDecision = {
				type: 'json',
				source: 'user',
				intent: isAllow
					? {kind: isPreToolUse ? 'pre_tool_allow' : 'permission_allow'}
					: {
							kind: isPreToolUse ? 'pre_tool_deny' : 'permission_deny',
							reason: 'Denied by user via permission dialog',
						},
			};

			runtime.sendDecision(requestId, runtimeDecision);
			dequeuePermission(requestId);
		},
		[runtime, permissionQueue, addRule, dequeuePermission],
	);

	const resolveQuestion = useCallback(
		(requestId: string, answers: Record<string, string>) => {
			const runtimeDecision: RuntimeDecision = {
				type: 'json',
				source: 'user',
				intent: {kind: 'question_answer', answers},
			};
			runtime.sendDecision(requestId, runtimeDecision);
			dequeueQuestion(requestId);
		},
		[runtime, dequeueQuestion],
	);

	const printTaskSnapshot = useCallback(() => {
		const hasTasks = feedEventsRef.current.some(
			e =>
				e.kind === 'tool.pre' &&
				e.data.tool_name === 'TodoWrite' &&
				e.actor_id === 'agent:root',
		);
		if (!hasTasks) return;

		// Synthesize a notification feed event
		const mapper = mapperRef.current;
		const syntheticRuntime: RuntimeEvent = {
			id: `task-snapshot-${Date.now()}`,
			timestamp: Date.now(),
			hookName: 'Notification',
			sessionId: mapper.getSession()?.session_id ?? 'unknown',
			context: {cwd: '', transcriptPath: ''},
			interaction: {expectsDecision: false},
			payload: {
				hook_event_name: 'Notification',
				session_id: mapper.getSession()?.session_id ?? 'unknown',
				transcript_path: '',
				cwd: '',
				message: '\u{1F4CB} Task list snapshot requested via :tasks command',
			},
		};
		const newEvents = mapper.mapEvent(syntheticRuntime);
		if (!abortRef.current.signal.aborted) {
			setFeedEvents(prev => [...prev, ...newEvents]);
		}
	}, []);

	// Main effect: subscribe to runtime events
	useEffect(() => {
		abortRef.current = new AbortController();

		const controllerCallbacks: ControllerCallbacks = {
			getRules: () => rulesRef.current,
			enqueuePermission,
			enqueueQuestion,
			getLoopState: () => loopManagerRef.current?.getState() ?? null,
			updateLoopState: update => {
				if (update.active === false) loopManagerRef.current?.deactivate();
				if (update.iteration !== undefined)
					loopManagerRef.current?.incrementIteration();
			},
			signal: abortRef.current.signal,
		};

		const unsub = runtime.onEvent((runtimeEvent: RuntimeEvent) => {
			// Run controller for rule matching / queue management
			const result = handleEvent(runtimeEvent, controllerCallbacks);

			if (result.handled && result.decision) {
				// Immediate decision (rule match) — send
				runtime.sendDecision(runtimeEvent.id, result.decision);
			}

			// Map to feed events
			const newFeedEvents = mapperRef.current.mapEvent(runtimeEvent);

			// Persist runtime event + derived feed events
			if (sessionStoreRef.current) {
				try {
					sessionStoreRef.current.recordEvent(runtimeEvent, newFeedEvents);
				} catch (err) {
					sessionStoreRef.current.markDegraded(
						`recordEvent failed: ${err instanceof Error ? err.message : err}`,
					);
				}
			}

			if (!abortRef.current.signal.aborted && newFeedEvents.length > 0) {
				// Auto-dequeue permissions/questions from incoming events
				for (const fe of newFeedEvents) {
					if (fe.kind === 'permission.decision' && fe.cause?.hook_request_id) {
						dequeuePermission(fe.cause.hook_request_id);
					}
				}

				setFeedEvents(prev => {
					const updated = [...prev, ...newFeedEvents];
					return updated.length > MAX_EVENTS
						? updated.slice(-MAX_EVENTS)
						: updated;
				});
			}
		});

		const unsubDecision = runtime.onDecision(
			(eventId: string, decision: RuntimeDecision) => {
				if (abortRef.current.signal.aborted) return;
				const feedEvent = mapperRef.current.mapDecision(eventId, decision);
				if (feedEvent) {
					// Persist decision event (feed-only, no runtime event)
					if (sessionStoreRef.current) {
						try {
							sessionStoreRef.current.recordFeedEvents([feedEvent]);
						} catch (err) {
							sessionStoreRef.current.markDegraded(
								`recordFeedEvents failed: ${err instanceof Error ? err.message : err}`,
							);
						}
					}

					setFeedEvents(prev => [...prev, feedEvent]);

					// Auto-dequeue permissions/questions when decision arrives
					if (
						feedEvent.kind === 'permission.decision' &&
						feedEvent.cause?.hook_request_id
					) {
						dequeuePermission(feedEvent.cause.hook_request_id);
					}
				}
			},
		);

		runtime.start();

		return () => {
			abortRef.current.abort();
			unsub();
			unsubDecision();
			runtime.stop();
		};
	}, [runtime, enqueuePermission, enqueueQuestion, dequeuePermission]);

	// Derive items (content ordering)
	const items = useMemo(
		() => mergeFeedItems(messages, feedEvents),
		[messages, feedEvents],
	);

	// Extract tasks from latest TodoWrite
	const tasks = useMemo((): TodoItem[] => {
		const lastTodoWrite = feedEvents
			.filter(
				e =>
					e.kind === 'tool.pre' &&
					e.data.tool_name === 'TodoWrite' &&
					e.actor_id === 'agent:root',
			)
			.at(-1);
		if (!lastTodoWrite || lastTodoWrite.kind !== 'tool.pre') return [];
		const input = lastTodoWrite.data.tool_input as unknown as
			| TodoWriteInput
			| undefined;
		return Array.isArray(input?.todos) ? input.todos : [];
	}, [feedEvents]);

	const postByToolUseId = useMemo(
		() => buildPostByToolUseId(feedEvents),
		[feedEvents],
	);

	return {
		items,
		feedEvents,
		tasks,
		session: mapperRef.current.getSession(),
		currentRun: mapperRef.current.getCurrentRun(),
		actors: mapperRef.current.getActors(),
		isServerRunning: runtime.getStatus() === 'running',
		currentPermissionRequest,
		permissionQueueCount: permissionQueue.length,
		resolvePermission,
		currentQuestionRequest,
		questionQueueCount: questionQueue.length,
		resolveQuestion,
		resetSession,
		clearEvents,
		rules,
		addRule,
		removeRule,
		clearRules,
		printTaskSnapshot,
		isDegraded: sessionStoreRef.current?.isDegraded ?? false,
		postByToolUseId,
		allocateSeq: () => mapperRef.current.allocateSeq(),
		recordTokens,
		restoredTokens,
		setLoopManager: (mgr: LoopManager | null) => {
			loopManagerRef.current = mgr;
		},
	};
}
