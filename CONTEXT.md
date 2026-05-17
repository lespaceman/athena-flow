---
name: drisp-cli-context
description: Domain language for the drisp/cli workflow runtime — feed pipeline, harnesses, runs, and sessions.
type: project
---

# drisp/cli

Workflow runtime for AI coding harnesses (Claude Code, Codex). Intercepts harness hook events, normalizes them, persists them, and renders them in a terminal UI.

## Language

### Pipeline

**RuntimeEvent**:
A normalized harness event (one of ~30 kinds: `tool.pre`, `session.start`, `permission.request`, etc.) emitted by a harness adapter.
_Avoid_: hook event, raw event, protocol event.

**RuntimeDecision**:
A delayed answer from the user/controller that resolves a prior `RuntimeEvent` (e.g. permission grant). Correlated by `request_id`.

**FeedEvent**:
A timeline-ready event derived from one or more `RuntimeEvent`s. Carries `event_id`, `seq`, `run_id`, `session_id`, `actor_id`, `kind`, `data`.
_Avoid_: feed item (that's a UI projection of multiple `FeedEvent`s).

**FeedMapper**:
The module that converts `RuntimeEvent` → `FeedEvent[]` and `RuntimeDecision` → `FeedEvent`. Stateful: maintains run/session/actor/correlation state across the event stream. Bootstraps from stored events on resume.

### State inside the FeedMapper

The mapper is internally composed of six named seams; each owns one slice of the mapper's state and has its own test surface.

**RunLifecycle**:
Owns `currentSession`, `currentRun`, run/session sequence numbers, and per-run counters (tool uses, failures, permission requests, blocks). Decides when a run starts, ends, or rolls over.
_Avoid_: run state, session manager.

**ToolCorrelation**:
Owns the `tool_use_id → feed event_id` index, streamed-output accumulators, and truncation state. Knows how a `tool.pre` enables a later `tool.post`/`tool.failure`/`tool.delta`, and how to handle a missing pre.

**DecisionCorrelation**:
Owns the `request_id → event_id` indexes that let `mapDecision` find the originating event. Has explicit invariants about restore behavior (fresh runs clear indexes; old `request_id`s never recur).
_Avoid_: request index, decision router.

**AgentMessageStream**:
Owns pending message buffers, dedup state per actor scope, and reasoning summary accumulation. Decides when an in-flight message is emittable.

**RootPlanTracker**:
Owns the **Root plan** — the canonical task list surfaced via `FeedMapper.getTasks()`. Knows how to compare a proposed plan against the current one (`differs`) and how to replace it (`set`). Updated from `session.start` bootstrap, `plan.delta`, and `tool.pre` for `TodoWrite`.
_Avoid_: task store, plan state.

**SubagentTracker**:
Owns the **Subagent stack** (LIFO of active subagent actor IDs), the **Pending description** handoff, and the per-agent description registry. Caller-prefixes actor IDs (`subagent:<id>`) — the tracker treats them as opaque strings.
_Avoid_: agent stack, subagent state.

### Identity

**Attachment**:
The binding between a paired CLI instance and one dashboard-side **runner**.
Owned by the dashboard (the CLI never creates or deletes one — it only
mirrors). Surfaced locally in `~/.config/athena/attachments.json`. Each
Attachment may receive dashboard assignments through the dashboard runtime
daemon and console traffic through a gateway sidecar. The Attachment does not
own a local harness process; dashboard assignment execution is owned by the
dashboard runtime daemon. See `docs/adr/0001-attachment-supervisor.md`.
_Avoid_: pairing (overloaded with the auth handshake), runner binding (verb
phrase, not a noun for the resulting state).

**Dashboard assignment**:
A dashboard-issued request for the paired runtime daemon to execute one
dashboard **Run** on behalf of a **runner**.
_Avoid_: job assignment (wire-frame name), remote assignment (describes one
transport path, not the domain concept).

**Run**:
One agent invocation within a **Session**. Triggered by `session.start` or `user.prompt`. Has a status (`running` | `completed`), counters, and an actor tree.

**Session**:
A drisp instance lifecycle. Spans many **Runs**. Identified by an adapter session id from the harness.

**Actor**:
A participant in a **Run** — the root agent or a subagent. Subagents form a stack (LIFO).

**Subagent**:
A child agent spawned by the root agent via the `Task` (or `Agent`) tool. Pushed onto the **Subagent stack** at `subagent.start`, removed at `subagent.stop`. Tracked by **SubagentTracker** for the duration of its lifecycle.

**Root plan**:
The canonical task list for the current session, sourced from `TodoWrite` tool inputs or `plan.delta` events and surfaced publicly via `FeedMapper.getTasks()`. Owned by **RootPlanTracker**. Survives across **Runs** within a **Session**.
_Avoid_: tasks (too generic), todo list (used in tool input but not as a domain term inside core/).

**Pending description**:
A description string captured from a subagent-spawning tool's input (`tool.pre` for `Task`/`Agent`) and consumed by the next `subagent.start` to populate the event payload and description registry. Single-slot buffer, cleared on consume or on a subsequent subagent `tool.pre` without a description.

### Gateway

**Dispatch turn**:
One inbound channel message routed to the **Registered runtime** and whose reply is routed back. Identified by a `dispatchId` minted on entry and resolved on `session.turn.complete`. Durable on both sides — parked in the **inbound queue** if no runtime is bound, parked in the **outbox** if the channel send fails.
_Avoid_: turn (overloaded with the FeedMapper "run"), dispatch (verb only).

**Registered runtime**:
The single Athena runtime currently bound to the gateway. Owns a `defaultAgentId`, a connection, a binding state (`active` | `stale` | absent), and a push handle the gateway uses to deliver `session.dispatch.turn` frames. Single-runtime in v1 — multi-runtime is a future change.

**DispatchPipeline**:
The gateway module that owns the **Dispatch turn** end-to-end. Wraps the binding store, the inbound queue, the outbox + drain loop, and the runtime push handle behind one interface. Owns the stale-binding grace timer and emits observer notifications for telemetry and external dispose.
_Avoid_: dispatcher (the historical class is now an internal collaborator), message pipeline (too generic).

## Relationships

- A **Session** contains many **Runs**.
- A **Run** is owned by one root **Actor**, which may spawn subagent **Actors**.
- A **RuntimeEvent** is mapped to zero or more **FeedEvent**s by the **FeedMapper**.
- A **RuntimeDecision** is mapped to one **FeedEvent** by the **FeedMapper**, correlated through **DecisionCorrelation**.
- The **FeedMapper** is composed of **RunLifecycle**, **ToolCorrelation**, **DecisionCorrelation**, **AgentMessageStream**, **RootPlanTracker**, and **SubagentTracker** as internal seams. Their combined interface is the seven-method `FeedMapper` type.
- The **Pending description** flows from `tool.pre` (Task/Agent) to the next `subagent.start`, where **SubagentTracker** consumes and clears it.
- The **Root plan** persists across **Runs** within a **Session** — only per-run state (subagent stack, tool/decision correlation, message stream) is reset between runs.
- A **Dispatch turn** is created by the **DispatchPipeline** when an inbound channel message arrives with a **Registered runtime** bound; resolved on the matching `session.turn.complete`.
- The **DispatchPipeline** owns the **Registered runtime** binding state — `Run`/`Session` (the FeedMapper concepts) live one layer up and are unrelated to the gateway-side runtime registration.
- A **Dashboard assignment** is admitted by the dashboard runtime daemon before
  it launches the corresponding dashboard **Run** locally.

## Example dialogue

> **Dev:** "When a `tool.post` arrives but `ToolCorrelation` has no matching pre, what does the **FeedMapper** emit?"
> **Domain expert:** "It emits a `tool.post` **FeedEvent** with a `cause` of `orphan`, because the missing-pre case is handled inside **ToolCorrelation** — the **FeedMapper** itself doesn't know what 'orphan' means."

## Flagged ambiguities

- "event" alone is ambiguous between **RuntimeEvent** and **FeedEvent** — always qualify.
- "session" alone is ambiguous between drisp **Session** and harness adapter session — say "adapter session" for the latter.
- "task" is overloaded by the protocol: `TodoWrite` tool inputs use it for plan items, while the `Task` tool spawns **Subagents**. Inside core/, say **plan step** for the former and **Subagent** for the latter — never bare "task."
