/**
 * Runtime boundary types.
 *
 * These types define the contract between the runtime layer (transport/protocol)
 * and the UI layer. UI code imports ONLY from this file — never from adapters
 * or protocol modules.
 */

// ── Runtime Event (adapter → UI) ─────────────────────────

export type RuntimeEvent = {
	/**
	 * Opaque correlation ID (maps to request_id internally).
	 * NOTE: request_id is NOT in the documented common input fields.
	 * Treat as best-effort — may be absent in some environments.
	 */
	id: string;
	/** Unix ms timestamp */
	timestamp: number;
	/** Hook event name as open string (forward compatible with unknown events) */
	hookName: string;
	/** Session ID from the hook event */
	sessionId: string;

	// Cross-event derived fields (never tool-specific)
	toolName?: string;
	toolUseId?: string;
	agentId?: string;
	agentType?: string;

	/** Base context present on all hook events */
	context: {
		cwd: string;
		transcriptPath: string;
		permissionMode?: string;
	};

	/** Interaction hints — does the runtime expect a decision? */
	interaction: {
		/** Whether runtime waits for sendDecision() */
		expectsDecision: boolean;
		/** Adapter-enforced timeout in ms (undefined = no timeout) */
		defaultTimeoutMs?: number;
		/** Protocol capability: can this event type be blocked? */
		canBlock?: boolean;
	};

	/** Opaque payload — UI renderers may deep-access but must not import protocol types */
	payload: unknown;
};

// ── Runtime Decision (UI → adapter) ──────────────────────

export type RuntimeDecisionType = 'passthrough' | 'block' | 'json';

/** Typed semantic intent — small, stable union */
export type RuntimeIntent =
	| {kind: 'permission_allow'}
	| {kind: 'permission_deny'; reason: string}
	| {kind: 'question_answer'; answers: Record<string, string>}
	| {kind: 'pre_tool_allow'}
	| {kind: 'pre_tool_deny'; reason: string}
	| {kind: 'stop_block'; reason: string};

export type RuntimeDecision = {
	type: RuntimeDecisionType;
	/** How this decision was made */
	source: 'user' | 'timeout' | 'rule';
	/** Semantic intent for 'json' decisions — adapter translates to protocol-specific shapes */
	intent?: RuntimeIntent;
	/** Reason string for 'block' decisions */
	reason?: string;
	/** Raw data payload (e.g., for future extension) */
	data?: unknown;
};

// ── Runtime Interface ────────────────────────────────────

export type RuntimeEventHandler = (event: RuntimeEvent) => void;
export type RuntimeDecisionHandler = (
	eventId: string,
	decision: RuntimeDecision,
) => void;

export type Runtime = {
	start(): void;
	stop(): void;
	getStatus(): 'stopped' | 'running';
	/** Subscribe to events. Returns unsubscribe function. */
	onEvent(handler: RuntimeEventHandler): () => void;
	/** Subscribe to decisions (user, rule, or timeout). Returns unsubscribe function. */
	onDecision(handler: RuntimeDecisionHandler): () => void;
	/** Send a decision for a pending event. eventId must match RuntimeEvent.id */
	sendDecision(eventId: string, decision: RuntimeDecision): void;
};
