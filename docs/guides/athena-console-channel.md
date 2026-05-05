# Athena Console channel

The `console` channel adapter pairs an Athena CLI runtime with a broker
service so that any rich client (browser, mobile, desktop, partner UI) can
become a live conversational surface for the runtime. The adapter speaks
the `athena-console` protocol (see `src/shared/gateway-protocol/athenaConsole.ts`)
and is independent of the runtime control plane.

## Architecture

    Browser / mobile / desktop UI
              │  product session auth
              ▼
    Rich-client broker service          ← responsibility: routing,
              │                            user auth, message storage
              │  WSS (Authorization: Bearer <pairing token>)
              ▼
    CLI gateway `console` adapter
              │  ChannelAdapter contract
              ▼
    ChannelManager → Dispatcher → SessionRegistry → SessionBridge → Runtime
              ▲
              │
    RelayCoordinator for permission/question prompts

## Sidecar config

Place a JSON file at `~/.config/athena/channels/console.json` (mode 0600):

    {
      "broker_url": "wss://broker.example.com/api/runners/runner_123/console/adapter",
      "runner_id": "runner_123",
      "workspace_id": "workspace_42",
      "token_path": "/Users/you/.config/athena/console/pairing.jwt"
    }

Required keys:

- `broker_url` — `wss://` for production. `ws://` is allowed only for
  loopback hosts (`127.0.0.1`, `localhost`, `::1`).
- `runner_id` — broker-visible runner identity. One adapter socket binds to
  one runner identity for v1.
- One of:
  - `dashboard_config: true` (recommended) — the adapter mints a fresh
    short-lived access token via `/api/instances/refresh` before each broker
    connect, using the refresh credential stored at
    `~/.config/athena/dashboard.json`. Pair this machine first with
    `athena dashboard pair <token> --url <dashboard-origin>`.
  - `pairing_token` (inline) — long-lived bearer string. Use only for tests
    and one-off setups; not recommended for production because dashboard
    access tokens expire after 15 minutes.
  - `token_path` (absolute file path) — bearer credential read once at
    daemon start. Same caveat as `pairing_token`.

  These three modes are mutually exclusive. Tokens always travel in the
  `Authorization` header — never in the URL query string and never in logs.
  **`token_path` and `tls_ca_path` must be absolute paths — `~` is not
  expanded.**

Optional keys:

- `workspace_id` — broker-visible workspace/account id. Surfaced on every
  outbound frame for routing.
- `tls_ca_path` — PEM bundle for self-signed broker TLS in dev.

Dashboard-managed sidecar (recommended):

    {
      "broker_url": "wss://dashboard.example.com/api/runners/runner_123/console/adapter",
      "runner_id": "runner_123",
      "workspace_id": "workspace_42",
      "dashboard_config": true
    }

## Pairing flow

### Recommended: dashboard-managed pairing

1.  From the dashboard UI, copy the displayed pairing command:

        athena dashboard pair <pairing-token> --url <dashboard-origin>

    `athena-flow` and `drisp` are interchangeable aliases. The pairing
    token is single-use and short-lived (typically a few minutes).

2.  Run the command on the machine you want to pair. It posts to
    `/api/instances/pair`, then writes a long-lived refresh credential to
    `~/.config/athena/dashboard.json` (mode 0600, directory mode 0700).

        athena dashboard status     # confirm pairing
        athena dashboard refresh    # rotates the refresh token, mints a fresh access token
        athena dashboard connect    # opens the dashboard instance socket (runs until SIGINT)
        athena dashboard unpair     # forgets the local refresh credential

    Human output never prints tokens. Only `athena dashboard refresh --json`
    includes the access/refresh tokens (for scripted use); status and pair
    JSON output omit them.

3.  Drop a console sidecar at `~/.config/athena/channels/console.json`
    with `dashboard_config: true`. On daemon start, the adapter calls
    `refreshDashboardAccessToken()` before each broker connect (initial and
    reconnect), then sends the resulting access token via the
    `Authorization` header. The refresh token in
    `~/.config/athena/dashboard.json` is rotated on every refresh.

4.  The adapter sends `console.hello`, the broker replies with
    `console.ready`, and the channel is live.

### Legacy: static pairing token

1. The broker issues a runner-scoped pairing token when the operator
   pairs a runner from the product UI.
2. The operator drops the token at `token_path` (or pastes inline as
   `pairing_token` for one-off tests).
3. On daemon start, the gateway reads the sidecar, instantiates the
   adapter, and opens a single WSS to `broker_url` with
   `Authorization: Bearer <token>`.

This path does not auto-refresh — when the token expires the broker
closes the socket and the adapter cannot reconnect. Prefer
`dashboard_config: true` for any multi-hour deployment.

## Security model

- With `dashboard_config: true`, the adapter mints a short-lived access
  token before each broker connect (initial and reconnect). Only the
  long-lived refresh token is stored on disk, at
  `~/.config/athena/dashboard.json` (mode 0600). Refresh tokens rotate on
  every refresh; a stolen refresh token is invalidated on the next legitimate
  refresh.
- With static `pairing_token` / `token_path`, the token is loaded once at
  daemon start. To rotate, replace the file/value and restart the daemon.
- Tokens are redacted from all log output and thrown errors. With
  `dashboard_config`, the redacted value is the most-recently-resolved
  access token.
- Outbound frames carry `runnerId` and `workspaceId`. Routing across runners
  is the broker's responsibility — the adapter binds to one runner.
- Rich-client socket auth (browser session, mobile JWT, etc.) is the
  broker's responsibility; the CLI adapter never sees end-user credentials.

## Local dev with a fake broker

A 60-line WS server that accepts the adapter and replays canned frames is
enough to drive every code path in `src/gateway/adapters/console/`:

    import {WebSocketServer} from 'ws';
    const server = new WebSocketServer({port: 8787});
    server.on('connection', ws => {
      ws.on('message', data => {
        const frame = JSON.parse(String(data));
        if (frame.kind === 'console.hello') {
          ws.send(JSON.stringify({
            kind: 'console.ready', frameId: 'r', sentAt: Date.now(),
            protocolVersion: 1, brokerName: 'fake', address: {runnerId: 'r1'},
          }));
          // simulate an inbound user message
          setTimeout(() => ws.send(JSON.stringify({
            kind: 'console.message.in', frameId: 'm1', sentAt: Date.now(),
            address: {runnerId: 'r1', userId: 'tester'},
            messageId: 'm1', idempotencyKey: 'fake:r1:m1', text: 'hello',
          })), 200);
        }
      });
    });

Sidecar pointing at this fake:

    {
      "broker_url": "ws://127.0.0.1:8787/adapter",
      "runner_id": "r1",
      "pairing_token": "anything"
    }

Start the gateway, register a runtime, and verify:

- `athena gateway status --json` shows the `console` adapter healthy.
- The fake's "hello" message reaches the runtime.
- The runtime's reply arrives back at the fake broker as
  `console.message.out`.
- Trigger a permission prompt; the broker receives
  `console.permission.request`, replies with `console.permission.response`,
  and the runtime continues with the chosen verdict.

## Failure modes

- **Broker unreachable on start:** the adapter's `start()` rejects.
  `loadChannelSidecars` already treats per-channel start failure as a
  non-fatal warning (other channels keep running). Restart the daemon once
  the broker is reachable.
- **Token rejected:** broker sends `console.error` with code
  `unauthorized`. Adapter exits start; restart with a refreshed token.
- **Connection blip after ready:** the broker client reconnects with full-
  jitter backoff (1s → 30s, capped). Pending relays are immediately
  cancelled with reason `connection_lost` — the runtime is expected to
  re-prompt if the user has not yet acted. The broker has no replay
  obligation in this adapter version; persistence of pending relays
  across reconnect is out of scope.
- **Daemon shutdown:** all pending relays resolve as `cancelled`; the
  broker socket closes with status 1000 and no reconnect is attempted.

## Smoke test checklist (real broker)

1. Pair a runner in the product UI and copy the token to `token_path`.
2. Start the gateway daemon.
3. Open the rich-client UI, navigate to the runner's Console surface.
4. Type a prompt — verify the assistant replies inline.
5. Trigger a tool that needs permission — verify the modal appears and the
   verdict round-trips.
6. Trigger a question prompt — verify answers round-trip.
7. Restart the daemon — verify the UI shows `disconnected` until the
   adapter reconnects.

## Companion broker work

The first broker is the dashboard Worker (separate repo). It must:

- Expose `GET /api/runners/:runnerId/console/adapter` for the CLI WSS.
- Expose `GET /api/runners/:runnerId/console/ws` for browser/mobile UI.
- Authenticate the adapter route via the existing instance-pairing JWT.
- Authenticate browser/mobile routes via dashboard user session auth.
- Verify the user has access to the runner/workspace before joining the
  console room.
- Maintain one active adapter socket per runner, fan out to many
  browser/mobile sockets subscribed to the same runner.
- Forward browser/mobile messages to the adapter as `console.message.in`.
- Broadcast `console.message.out` and relay frames to subscribed UI
  sockets.
- Persist console messages so a refresh shows recent conversation state.

UI tab requirements (dashboard repo): conversation transcript, composer,
connection status indicator, permission/question modals, empty state for
no paired runner, reconnect/error states.
