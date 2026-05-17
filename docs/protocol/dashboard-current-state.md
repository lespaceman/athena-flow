# Dashboard Runtime-Dashboard Protocol: Current State

Status: current implementation snapshot  
Last reviewed: 2026-05-17

## Purpose

This document records the current dashboard-side behavior implemented across the Convex backend and Worker/Durable Object edge layer. It describes the protocol as it exists now, including compatibility paths that are still present.

## Main Components

| Area                  | Current implementation                                       |
| --------------------- | ------------------------------------------------------------ |
| Pairing and refresh   | `convex/instances.ts`, `src/lib/api/instances-api.ts`        |
| Attachment model      | `convex/lib/attachments.ts`, `convex/runners.ts`             |
| Remote dispatch       | `convex/runs/dispatch.ts`, `convex/lib/runs/dispatchPrep.ts` |
| Queue and concurrency | `convex/runs/queue.ts`, `convex/lib/leases.ts`               |
| Instance socket DO    | `src/lib/durable-objects/instance-socket-do.ts`              |
| Typed instance frames | `convex/lib/instanceFrames.ts`                               |
| Feed ingestion        | `convex/athenaFeed.ts`                                       |
| Per-run stream        | `src/lib/durable-objects/run-stream-do.ts`                   |
| Reconciliation        | `convex/runs/reconcile.ts`, `convex/crons.ts`                |

## Pairing and Authentication

### Pairing token creation

- Authenticated dashboard users call `instances.createPairing`.
- Each token:
  - is one-time use;
  - is stored hashed;
  - expires after 10 minutes;
  - may optionally carry a `runnerId`.
- The dashboard can create many pairings over time. The code does not enforce a one-pairing-per-user/org cap.

### Pairing token consumption

`POST /api/instances/pair` is proxied to Convex and eventually calls `consumePairing`:

1. Validate token hash, pending state, and expiry.
2. Validate optional bound runner and ensure it is not archived.
3. Resolve CLI version/capabilities.
4. Create a new `remoteInstances` row with:
   - org ownership
   - dashboard name
   - pairing-token hash
   - fingerprint
   - host info
   - status `online`
   - capabilities
5. Mark the pairing consumed.
6. If the pairing carried a runner, attach that runner to the new instance and flip runner execution target to `remote`.
7. Mint a long-lived refresh token bound to a fingerprint hash.
8. Return:
   - `instanceId`
   - `refreshToken`
   - `jti`
   - attached `runners`
   - `requiredCliVersion`
   - `capabilityAck`

### Access and refresh tokens

- Access tokens are short-lived JWTs verified at the Worker edge for:
  - socket upgrade
  - active runs
  - attachments
  - revoke
  - runner remote-status
- Refresh tokens are single-use and fingerprint-bound.
- Refresh and revoke endpoints are proxied through the Worker to Convex HTTP handlers.

## Instance, Runner, and Attachment Model

### Instance model

`remoteInstances` supports statuses:

- `online`
- `idle`
- `offline`
- `revoked`

Dashboard availability uses:

- persisted status; and
- a liveness window of 60 seconds from `lastSeenAt`.

The socket Durable Object writes heartbeats at most once every 15 seconds when it receives CLI pings.

### Attachment model

- Attachment rows bind one runner to one instance at a time.
- Runner binding reads are derived from `attachments`, not the legacy `runners.remoteInstanceId` field.
- One instance may have multiple attached runners.
- One runner has at most one active attachment.
- The dashboard pushes `attachments.changed` with full-list semantics after attach/detach changes.
- If the CLI is offline, that push is dropped; correctness relies on HTTP refresh after reconnect.

## Dashboard-Initiated Dispatch

### Run creation and queueing

Dashboard runs are persisted in `runs` with statuses:

`queued -> starting -> running -> succeeded|failed|cancelled|timeout|force_failed`

Additional transient state:

- `cancelling`

Concurrency is enforced before dispatch through leases:

- org-wide cap
- runner-specific cap

If no lease is available, the run remains `queued`.

### Remote dispatch flow

For remote runners:

1. Load runner/workflow/run facts.
2. Resolve the runner's current attachment.
3. Mint per-run callback credentials through `prepareDispatch`:
   - `callbackWsUrl`
   - `callbackToken`
4. Merge env with precedence:
   - runner vars
   - dispatch overrides
   - secrets are still a TODO for remote dispatch
5. Render prompt.
6. Resolve remote session identifiers:
   - `athenaSessionId`
   - `adapterResumeSessionId`
7. Build opaque `runSpec`.
8. POST internal dispatch to the instance DO:
   - `runId`
   - `runSpec`
   - `runnerId`
9. If no live socket exists:
   - store pending assignment in the instance DO;
   - mark run back to `queued` with `errorSummary = "awaiting_instance"`;
   - release leases.
10. If delivered:

- mark run `running`.

### Offline dispatch

- Offline remote dispatch is not rejected outright.
- Pending assignments are stored in the instance DO and drained on reconnect.
- Cancelling while offline removes a matching pending assignment when present.

## Socket and Message Layer

### Instance socket

Worker route:

- `GET /api/instances/:id/socket`

Auth sources accepted:

- `Authorization: Bearer`
- `?token=`
- `Sec-WebSocket-Protocol`

The Worker verifies the access token and instance match, then upgrades through `InstanceSocketDO`.

### Server-to-CLI frames

| Frame                 | Current dashboard meaning                           |
| --------------------- | --------------------------------------------------- |
| `job_assignment`      | Dispatch an opaque run spec to a paired CLI.        |
| `cancel`              | Ask CLI to abort a live run.                        |
| `dashboard_decision`  | Deliver a user decision to a paired session.        |
| `attachments.changed` | Replace the CLI attachment mirror.                  |
| `feed_ack`            | Confirm durable feed ingest or duplicate detection. |
| `pong`                | Reply to heartbeat.                                 |

### CLI-to-server frames

| Frame                 | Current dashboard meaning                                         |
| --------------------- | ----------------------------------------------------------------- |
| `ping`                | Heartbeat; triggers best-effort Convex heartbeat write.           |
| `assignment_accepted` | Receipt only; currently no state transition or timeout clearing.  |
| `decision_ack`        | Allows queued decision removal and Convex delivered-state update. |
| `feed_event`          | Canonical paired-session feed ingestion path.                     |
| `run_event`           | Legacy compatibility path forwarded into `RunStreamDO`.           |

## Session, Feed, and Decision State

### Session model

`athenaSessions` is keyed by org, instance, and `athenaSessionId`.

Current fields include:

- `latestRunId`
- `origin` (`local` or `dashboard`)
- `status`
- optional linked `runnerId`
- optional linked dashboard `runId`
- last event timestamp and sequence

Session status is derived from ingested feed events rather than from assignment receipt.

### Feed ingestion

`feed_event`:

- is validated at the socket edge;
- must carry the same `instanceId` as the socket;
- is ingested via Convex HTTP;
- is idempotent by `(instanceId, eventId)`;
- receives `feed_ack` only after persistence or duplicate detection.

The dashboard stores both summarized and raw feed data and uses feed semantics to:

- create/update session rows;
- bind dashboard runs to `athenaSessionId` when needed;
- transition run status on terminal feed events.

### Decisions

- User decisions are stored in `athenaSessionDecisions`.
- Delivery is scheduled to the instance DO.
- The DO:
  - stores pending decisions durably;
  - deduplicates by `(athenaSessionId, requestId)`;
  - replays on reconnect;
  - removes only after `decision_ack`.
- Convex marks a decision delivered only after the DO receives the ACK and successfully reports delivery upstream.

## Per-Run Stream Compatibility Path

`RunStreamDO` still supports a separate callback WebSocket:

- strict monotonically increasing `seq`;
- `resume` on connect;
- `ack` per frame;
- at-least-once client replay;
- terminal kinds close the stream and finalize archive/tail state.

The dashboard still mints `callbackWsUrl` and `callbackToken` for remote dispatches. Newer CLIs prefer this durable per-run channel for remote run events when credentials are present, but the canonical paired-session UI stream is now `feed_event`.

## Reconnect, Retry, and Failure Semantics

### Instance liveness

- Heartbeat updates are best effort.
- Cron reconciliation marks instances/runs stale when heartbeats stop.
- `reconcileRemoteLiveness` force-fails:
  - remote `starting` runs older than the stale threshold with `remote_dispatch_start_timeout`;
  - remote active runs whose instance is stale with `remote_instance_unresponsive`.

### Cancellation and timeout

- `requestCancel` moves a run to `cancelling`.
- Cancellation requests are sent to both:
  - run stream path; and
  - instance socket path for remote runs.
- `forceFailExpiredCancellations` changes overdue `cancelling` runs to `force_failed` with `cancel_deadline_exceeded`.
- Hosted and remote executions use configured timeout seconds in their dispatch specs.

### Retry behavior

- Remote dispatch retries transient network/5xx failures three times with exponential-ish backoff.
- Offline assignments are queued in DO storage and drained on reconnect.
- Pending decisions are queued durably and replayed.
- `attachments.changed` is not queued.
- Feed duplicates are accepted idempotently.

## Current-State Lifecycle Tables

### Pairing token

| State      | Meaning                    |
| ---------- | -------------------------- |
| `pending`  | Created, unexpired, unused |
| `consumed` | Successfully paired        |
| `expired`  | TTL elapsed before use     |

### Dashboard run

| State        | Meaning                                                       |
| ------------ | ------------------------------------------------------------- |
| `queued`     | Waiting for lease or instance availability                    |
| `starting`   | Lease acquired, dispatch in progress                          |
| `running`    | Dispatch delivered                                            |
| `cancelling` | Cancellation requested, awaiting completion                   |
| terminal     | `succeeded`, `failed`, `cancelled`, `timeout`, `force_failed` |

### Decision delivery

| State       | Meaning                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| `queued`    | Decision created, not yet ACKed by CLI                                           |
| `delivered` | CLI ACK reached DO and was reported to Convex                                    |
| `failed`    | Stored schema state exists, but normal retry path usually keeps decisions queued |

## Current Implementation Boundaries

- Dashboard owns pairing tokens, instance records, attachment rows, queue leases, dashboard run rows, decision rows, and session/read models.
- Durable Objects own transient connectivity queues and per-run stream state.
- CLI owns execution, local process health, local durable feed retry, and local decision consumption.

## Notable Current-State Ambiguities

- Pairing creates a fresh instance row rather than reusing by fingerprint.
- There is no explicit server-side upper bound on number of paired instances per org or per user in this code.
- `assignment_accepted` is informational only.
- `runnerConcurrencyCap` and the CLI daemon's local cap are not negotiated as one contract.
- Remote run specs still carry callback stream credentials even though canonical session state now flows through `feed_event`.
