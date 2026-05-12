Status: ready-for-agent

# PRD: Deepen Runtime, Feed, Permission, Shell, and Dashboard Execution Modules

## Problem Statement

The codebase has several high-value architectural seams, but important runtime behaviours still require reading broad, overloaded modules. A maintainer or AFK agent investigating one behaviour often has to scan unrelated RuntimeEvent routing, Codex protocol translation, permission queue handling, AppShell orchestration, or dashboard execution code before finding the real owner of the invariant.

This slows down fixes, increases regression risk, and makes tests heavier than they need to be. The problem is not missing functionality; it is that several modules expose simple names while still hiding too many unrelated responsibilities behind those names.

The user wants these areas deepened into modules with small, stable interfaces and isolated test surfaces, using the project vocabulary from `CONTEXT.md` and respecting the superseding dashboard decision in ADR 0001.

## Solution

Deepen the runtime-facing architecture around the existing domain concepts:

- RuntimeEvent families become explicit routing modules behind the FeedMapper.
- Codex protocol translation is split by protocol responsibility while preserving the small adapter interface.
- Permission request handling gains one lifecycle owner from RuntimeEvent to RuntimeDecision and queue cleanup.
- Session shell orchestration is separated from terminal rendering and panel interaction.
- Dashboard execution is aligned with ADR 0001’s superseding decision: the dashboard runtime daemon remains the local remote-sync process, but its responsibilities should be clarified and duplicated old/new execution paths should be collapsed only where that is still consistent with the current decision.

Each deepened module should encapsulate meaningful behaviour behind a narrow interface and be testable without rendering the full UI, booting a full harness, or feeding every case through the largest integration seam.

## User Stories

1. As a maintainer, I want RuntimeEvent family routing to live in named modules, so that I can change `tool.*` behaviour without scanning unrelated notification or subagent logic.
2. As a maintainer, I want FeedEvent construction for each RuntimeEvent family to be local to that family, so that event-specific invariants are easier to inspect.
3. As a maintainer, I want FeedMapper state seams to remain explicit, so that RunLifecycle, ToolCorrelation, DecisionCorrelation, AgentMessageStream, RootPlanTracker, and SubagentTracker keep their current domain ownership.
4. As a maintainer, I want the public FeedMapper interface to stay small, so that callers do not learn about every internal routing module.
5. As an AFK agent, I want isolated tests for RuntimeEvent families, so that I can safely modify one family without running a large mapper scenario for every detail.
6. As a maintainer, I want Codex item lifecycle translation isolated from JSON-RPC method routing, so that item-shape changes are handled in one place.
7. As a maintainer, I want Codex notification translation isolated from approval/server-request translation, so that unrelated protocol cases do not share one overloaded function.
8. As an AFK agent, I want Codex item-to-RuntimeEvent tests that do not load unrelated protocol cases, so that adapter changes are smaller and easier to verify.
9. As a maintainer, I want permission handling to have one lifecycle owner, so that rule matching, queue state, local dialog decisions, remote relay, and RuntimeDecision construction do not drift apart.
10. As a user, I want permission prompts to behave consistently after relay reconnects, so that a remote or local decision resolves the same request once.
11. As a user, I want “always allow” and scoped permission rules to clean up permission queues predictably, so that stale prompts do not remain visible.
12. As a maintainer, I want permission lifecycle tests through one interface, so that queue cleanup, RuntimeDecision construction, and auto-dequeue behaviour can be verified together.
13. As a maintainer, I want AppShell to delegate Session startup and setup/session picker phases to a focused Session shell module, so that rendering concerns do not obscure lifecycle logic.
14. As a maintainer, I want terminal rendering and panel interaction to stay separate from runtime/session orchestration, so that UI changes do not risk Session startup regressions.
15. As an AFK agent, I want shell state transition tests that do not render the full feed surface, so that setup and picker flows are cheaper to change.
16. As a dashboard user, I want the paired CLI instance to keep remote sync responsibilities clear, so that dashboard-requested Sessions, local Sessions, feed outbox publishing, and inbound decisions remain reliable.
17. As a maintainer, I want dashboard execution code to follow ADR 0001’s superseding decision, so that we do not accidentally revive the historical multi-runtime gateway proposal as current architecture.
18. As a maintainer, I want the dashboard runtime daemon’s roles to be explicit, so that paired instance socket ownership, feed outbox draining, decision inbox persistence, and assignment launch are not treated as one vague daemon concern.
19. As an AFK agent, I want old/new dashboard execution paths collapsed only when behaviour is demonstrably equivalent, so that dashboard Sessions do not regress while architecture is simplified.
20. As a maintainer, I want each deepened module to have a stable interface, so that future changes can be made by understanding the module contract instead of the whole application.
21. As a reviewer, I want architecture-deepening changes to be staged in independently reviewable slices, so that risky moves are not hidden in broad refactors.
22. As a maintainer, I want tests to assert external behaviour rather than file layout, so that implementation can continue to move while the product contract stays stable.
23. As a user, I want no visible behaviour regression from these changes, so that architectural cleanup does not alter normal CLI, dashboard, or permission workflows.

## Implementation Decisions

- Build or deepen a RuntimeEvent family routing layer behind the FeedMapper. It should group behaviour by RuntimeEvent family, such as tool events, notifications, subagent events, plan deltas, session/run lifecycle events, and permission events.
- Keep the FeedMapper public interface stable. The deepened routing modules are internal collaborators, not new caller-facing concepts.
- Preserve the existing FeedMapper state seams: RunLifecycle, ToolCorrelation, DecisionCorrelation, AgentMessageStream, RootPlanTracker, and SubagentTracker. Routing modules may depend on these seams, but should not duplicate their state.
- Avoid moving state into generic helpers. Each new internal module should own a coherent family of RuntimeEvent-to-FeedEvent behaviour.
- Deepen the Codex adapter by separating JSON-RPC method routing from Codex item lifecycle translation, notification translation, and approval/server-request conversion.
- Keep the Codex adapter’s external contract stable: callers should still receive normalized RuntimeEvents and not learn Codex protocol details.
- Introduce a permission lifecycle owner that coordinates permission.request RuntimeEvents, rule matching, pending queue state, local UI decisions, remote relay decisions, RuntimeDecision construction, and cleanup.
- Treat permission transport/UI modules as collaborators of the lifecycle owner. They should not each reimplement permission-specific invariants.
- Deepen Session shell orchestration by separating Session startup, setup/session picker phases, workflow/model picker state, runtime lifecycle, and telemetry from terminal rendering and panel interaction.
- Keep AppShell as the composition surface, but reduce its direct knowledge of Session lifecycle details.
- For dashboard execution, follow ADR 0001’s superseding decision: dashboard pairing is one local CLI instance broadcasting canonical FeedEvent envelopes through a durable outbox; runner scheduling is dashboard-side metadata, not a CLI routing key for feed publishing or execution.
- Preserve the dashboard runtime daemon as the local remote-sync process unless a later ADR changes that decision. Its explicit responsibilities are paired instance socket ownership, feed outbox draining, inbound dashboard decision persistence, and launching dashboard assignments through the same runExec path used by local exec.
- Do not revive the historical process-per-Attachment supervisor/gateway runner plan as if it were current. Treat it as historical context only.
- Prefer small compatibility-preserving slices. Each slice should move behaviour behind a deeper module without changing user-visible CLI, dashboard, permission, or feed behaviour.
- Avoid broad file moves that only rename modules. A slice is valuable when it creates a narrower interface, concentrates an invariant, or enables smaller behavioural tests.

## Testing Decisions

- Good tests assert external behaviour: given a RuntimeEvent, Codex protocol frame, permission request, shell user action, or dashboard daemon condition, the resulting FeedEvents, RuntimeDecisions, queue state, status output, or lifecycle transition should match the product contract.
- Tests should not assert private file layout or call chains. They should assert the stable interface of the deepened module.
- FeedMapper deepening should add or migrate tests around RuntimeEvent families. Prior art exists in FeedMapper tests and the internals around ToolCorrelation, DecisionCorrelation, AgentMessageStream, RootPlanTracker, and SubagentTracker.
- Codex adapter deepening should add focused item lifecycle, notification, and approval/server-request tests. Prior art exists in the Codex event translator tests.
- Permission lifecycle deepening should add tests that cover local decision, remote relay decision, scoped/always-allow rules, queue cleanup, and reconnect behaviour through one permission lifecycle interface.
- Session shell deepening should add tests around setup/session picker transitions and Session startup state without rendering the entire feed surface.
- Dashboard execution deepening should keep runtime daemon tests for paired instance socket reconnects, feed outbox draining, decision inbox persistence, assignment launch, and status snapshots. Existing dashboard runtime daemon tests are prior art.
- Each slice should run the narrow test file for the moved behaviour plus a broader integration or command test when the public CLI surface can be affected.
- Typecheck is required for each slice because the work intentionally changes module interfaces.

## Out of Scope

- Changing the visible feed UI design.
- Changing FeedEvent schema, RuntimeEvent schema, or RuntimeDecision schema unless a slice proves a schema gap and is separately specified.
- Replacing the dashboard runtime daemon with the historical process-per-Attachment supervisor/gateway runner design from the superseded section of ADR 0001.
- Changing dashboard server APIs or runner scheduling semantics.
- Reworking harness subprocess architecture.
- Renaming domain terms from `CONTEXT.md`.
- Large mechanical file moves without a deeper interface or behavioural test payoff.
- Fixing unrelated bugs discovered during exploration unless they block the slice and are covered by a regression test.

## Further Notes

- This PRD is intentionally architectural. It should be broken into independently grabbable implementation issues before coding.
- The highest-risk slices are permission lifecycle and dashboard execution because they cross UI, transport, and runtime boundaries.
- The lowest-risk first slice is likely Codex adapter deepening or one RuntimeEvent family in FeedMapper, because each can be isolated behind existing tests.
- The dashboard section must be read with the 2026-05-12 superseding decision in ADR 0001. The earlier multi-runtime gateway plan is not current product direction.
