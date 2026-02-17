/**
 * React hook that wraps a Runtime instance and bridges to UI state.
 *
 * Assumes runtime is memoized/stable — do not create inline in render.
 */

import {useEffect, useRef, useState, useCallback} from 'react';
import type {Runtime, RuntimeEvent, RuntimeDecision} from '../runtime/types.js';
import type {HookEventDisplay} from '../types/hooks/display.js';
import type {HookRule} from '../types/rules.js';
import type {PermissionDecision} from '../types/server.js';
import {handleEvent, type ControllerCallbacks} from './hookController.js';
import {mapToDisplay} from './mapToDisplay.js';
import {useRequestQueue} from './useRequestQueue.js';
/** Generate unique IDs for rules (inlined to avoid protocol imports). */
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_EVENTS = 100;

export type UseRuntimeResult = {
	events: HookEventDisplay[];
	isServerRunning: boolean;
	socketPath: string | null;
	currentSessionId: string | null;
	resetSession: () => void;
	rules: HookRule[];
	addRule: (rule: Omit<HookRule, 'id'>) => void;
	removeRule: (id: string) => void;
	clearRules: () => void;
	clearEvents: () => void;
	currentPermissionRequest: HookEventDisplay | null;
	permissionQueueCount: number;
	resolvePermission: (requestId: string, decision: PermissionDecision) => void;
	currentQuestionRequest: HookEventDisplay | null;
	questionQueueCount: number;
	resolveQuestion: (requestId: string, answers: Record<string, string>) => void;
	printTaskSnapshot: () => void;
	respond: (requestId: string, result: unknown) => void;
	pendingEvents: HookEventDisplay[];
};

export function useRuntime(runtime: Runtime): UseRuntimeResult {
	const [events, setEvents] = useState<HookEventDisplay[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [rules, setRules] = useState<HookRule[]>([]);
	const rulesRef = useRef<HookRule[]>([]);
	const abortRef = useRef<AbortController>(new AbortController());
	const eventsRef = useRef<HookEventDisplay[]>([]);

	rulesRef.current = rules;
	eventsRef.current = events;

	// Request queues
	const {
		current: currentPermissionRequest,
		count: permissionQueueCount,
		enqueue: enqueuePermission,
		dequeue: dequeuePermission,
	} = useRequestQueue(events);
	const {
		current: currentQuestionRequest,
		count: questionQueueCount,
		enqueue: enqueueQuestion,
		dequeue: dequeueQuestion,
	} = useRequestQueue(events);

	const resetSession = useCallback(() => setCurrentSessionId(null), []);

	const addRule = useCallback((rule: Omit<HookRule, 'id'>) => {
		const newRule: HookRule = {...rule, id: generateId()};
		setRules(prev => [...prev, newRule]);
	}, []);

	const removeRule = useCallback((id: string) => {
		setRules(prev => prev.filter(r => r.id !== id));
	}, []);

	const clearRules = useCallback(() => setRules([]), []);
	const clearEvents = useCallback(() => setEvents([]), []);

	// Update an existing display event by id
	const updateEvent = useCallback(
		(id: string, patch: Partial<HookEventDisplay>) => {
			if (abortRef.current.signal.aborted) return;
			setEvents(prev => prev.map(e => (e.id === id ? {...e, ...patch} : e)));
		},
		[],
	);

	const resolvePermission = useCallback(
		(requestId: string, decision: PermissionDecision) => {
			const isAllow = decision !== 'deny' && decision !== 'always-deny';

			// Persist "always" decisions as rules
			const event = eventsRef.current.find(e => e.id === requestId);
			const toolName = event?.toolName;
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
			updateEvent(requestId, {
				status: isAllow ? 'json_output' : 'blocked',
			});
			dequeuePermission(requestId);
		},
		[runtime, addRule, updateEvent, dequeuePermission],
	);

	const resolveQuestion = useCallback(
		(requestId: string, answers: Record<string, string>) => {
			const runtimeDecision: RuntimeDecision = {
				type: 'json',
				source: 'user',
				intent: {kind: 'question_answer', answers},
			};
			runtime.sendDecision(requestId, runtimeDecision);
			updateEvent(requestId, {status: 'json_output'});
			dequeueQuestion(requestId);
		},
		[runtime, updateEvent, dequeueQuestion],
	);

	const printTaskSnapshot = useCallback(() => {
		const hasTasks = eventsRef.current.some(
			e =>
				e.hookName === 'PreToolUse' &&
				e.toolName === 'TodoWrite' &&
				!e.parentSubagentId,
		);
		if (!hasTasks) return;

		const event: HookEventDisplay = {
			id: `task-snapshot-${Date.now()}`,
			timestamp: new Date(),
			hookName: 'Notification' as HookEventDisplay['hookName'],
			payload: {
				session_id: '',
				transcript_path: '',
				cwd: '',
				hook_event_name: 'Notification',
				message: '\u{1F4CB} Task list snapshot requested via :tasks command',
			} as unknown as HookEventDisplay['payload'],
			status: 'passthrough',
		};
		setEvents(prev => [...prev, event]);
	}, []);

	// Backwards-compat respond — ignores result, sends passthrough
	const respond = useCallback(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		(requestId: string, _result: unknown) => {
			runtime.sendDecision(requestId, {
				type: 'passthrough',
				source: 'user',
			});
		},
		[runtime],
	);

	useEffect(() => {
		abortRef.current = new AbortController();

		const controllerCallbacks: ControllerCallbacks = {
			getRules: () => rulesRef.current,
			enqueuePermission,
			enqueueQuestion,
			setCurrentSessionId,
			onTranscriptParsed: (eventId: string, summary: unknown) => {
				if (!abortRef.current.signal.aborted) {
					updateEvent(eventId, {
						transcriptSummary: summary as HookEventDisplay['transcriptSummary'],
					});
				}
			},
			signal: abortRef.current.signal,
		};

		const unsub = runtime.onEvent((runtimeEvent: RuntimeEvent) => {
			const displayEvent = mapToDisplay(runtimeEvent);

			// Run controller
			const result = handleEvent(runtimeEvent, controllerCallbacks);

			if (result.handled && result.decision) {
				// Immediate decision (rule match) — send and update status
				runtime.sendDecision(runtimeEvent.id, result.decision);
				displayEvent.status =
					result.decision.type === 'block'
						? 'blocked'
						: result.decision.type === 'json'
							? 'json_output'
							: 'passthrough';
			}

			// Append to events
			if (!abortRef.current.signal.aborted) {
				setEvents(prev => {
					const updated = [...prev, displayEvent];
					return updated.length > MAX_EVENTS
						? updated.slice(-MAX_EVENTS)
						: updated;
				});
			}
		});

		const unsubDecision = runtime.onDecision((eventId, decision) => {
			if (abortRef.current.signal.aborted) return;
			const status =
				decision.type === 'block'
					? 'blocked'
					: decision.type === 'json'
						? 'json_output'
						: 'passthrough';
			updateEvent(eventId, {status});
		});

		runtime.start();

		return () => {
			abortRef.current.abort();
			unsub();
			unsubDecision();
			runtime.stop();
		};
	}, [runtime, enqueuePermission, enqueueQuestion, updateEvent]);

	const pendingEvents = events.filter(e => e.status === 'pending');

	return {
		events,
		isServerRunning: runtime.getStatus() === 'running',
		socketPath: null,
		currentSessionId,
		resetSession,
		rules,
		addRule,
		removeRule,
		clearRules,
		clearEvents,
		currentPermissionRequest,
		permissionQueueCount,
		resolvePermission,
		currentQuestionRequest,
		questionQueueCount,
		resolveQuestion,
		printTaskSnapshot,
		respond,
		pendingEvents,
	};
}
