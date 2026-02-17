// source/hooks/useFeed.ts

import {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import type {Runtime, RuntimeEvent, RuntimeDecision} from '../runtime/types.js';
import type {FeedEvent} from '../feed/types.js';
import type {Session, Run, Actor} from '../feed/entities.js';
import type {HookRule} from '../types/rules.js';
import type {PermissionDecision} from '../types/server.js';
import type {Message} from '../types/common.js';
import type {TodoItem, TodoWriteInput} from '../types/todo.js';
import {createFeedMapper, type FeedMapper} from '../feed/mapper.js';
import {shouldExcludeFromFeed} from '../feed/filter.js';
import {handleEvent, type ControllerCallbacks} from './hookController.js';

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_EVENTS = 200;

// ── Types ────────────────────────────────────────────────

export type FeedItem =
	| {type: 'message'; data: Message}
	| {type: 'feed'; data: FeedEvent};

export type UseFeedResult = {
	items: FeedItem[];
	tasks: TodoItem[];
	session: Session | null;
	currentRun: Run | null;
	actors: Actor[];
	isServerRunning: boolean;

	currentPermissionRequest: FeedEvent | null;
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
};

// ── Hook ─────────────────────────────────────────────────

export function useFeed(
	runtime: Runtime,
	messages: Message[] = [],
): UseFeedResult {
	const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
	const [rules, setRules] = useState<HookRule[]>([]);
	const [permissionQueue, setPermissionQueue] = useState<string[]>([]);
	const [questionQueue, setQuestionQueue] = useState<string[]>([]);

	const mapperRef = useRef<FeedMapper>(createFeedMapper());
	const rulesRef = useRef<HookRule[]>([]);
	const abortRef = useRef<AbortController>(new AbortController());
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

	// Queue helpers
	const enqueuePermission = useCallback((requestId: string) => {
		setPermissionQueue(prev => [...prev, requestId]);
	}, []);

	const dequeuePermission = useCallback((requestId: string) => {
		setPermissionQueue(prev => prev.filter(id => id !== requestId));
	}, []);

	const enqueueQuestion = useCallback((requestId: string) => {
		setQuestionQueue(prev => [...prev, requestId]);
	}, []);

	const dequeueQuestion = useCallback((requestId: string) => {
		setQuestionQueue(prev => prev.filter(id => id !== requestId));
	}, []);

	// Derive current request from queue + feed events.
	// The queue stores RuntimeEvent.id (hook request_id). FeedEvent has
	// cause.hook_request_id that maps back to it.
	const currentPermissionRequest = useMemo(() => {
		if (permissionQueue.length === 0) return null;
		return (
			feedEvents.find(
				e =>
					e.kind === 'permission.request' &&
					e.cause?.hook_request_id === permissionQueue[0],
			) ?? null
		);
	}, [feedEvents, permissionQueue]);

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

			// Persist "always" decisions as rules
			const event = feedEventsRef.current.find(
				e =>
					e.kind === 'permission.request' &&
					e.cause?.hook_request_id === requestId,
			);
			const toolName =
				event?.kind === 'permission.request' ? event.data.tool_name : undefined;
			if (toolName) {
				if (decision === 'always-allow') {
					addRule({
						toolName,
						action: 'approve',
						addedBy: 'permission-dialog',
					});
				} else if (decision === 'always-deny') {
					addRule({
						toolName,
						action: 'deny',
						addedBy: 'permission-dialog',
					});
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

			const runtimeDecision: RuntimeDecision = {
				type: 'json',
				source: 'user',
				intent: isAllow
					? {kind: 'permission_allow'}
					: {
							kind: 'permission_deny',
							reason: 'Denied by user via permission dialog',
						},
			};

			runtime.sendDecision(requestId, runtimeDecision);
			dequeuePermission(requestId);
		},
		[runtime, addRule, dequeuePermission],
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
			setCurrentSessionId: () => {}, // session tracking handled by mapper
			onTranscriptParsed: () => {}, // transcript parsing handled differently now
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

			if (!abortRef.current.signal.aborted && newFeedEvents.length > 0) {
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
					setFeedEvents(prev => [...prev, feedEvent]);
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
	}, [runtime, enqueuePermission, enqueueQuestion]);

	// Derive items (content ordering)
	const items = useMemo((): FeedItem[] => {
		const messageItems: FeedItem[] = messages.map(m => ({
			type: 'message' as const,
			data: m,
		}));
		const feedItems: FeedItem[] = feedEvents
			.filter(e => !shouldExcludeFromFeed(e))
			.map(e => ({type: 'feed' as const, data: e}));

		return [...messageItems, ...feedItems].sort((a, b) => {
			const tsA = a.type === 'message' ? a.data.timestamp.getTime() : a.data.ts;
			const tsB = b.type === 'message' ? b.data.timestamp.getTime() : b.data.ts;
			return tsA - tsB;
		});
	}, [messages, feedEvents]);

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

	return {
		items,
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
	};
}
