# Gateway Boundary Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the runtime↔gateway boundary before adding the `console` channel adapter — relocate cross-cutting helpers (channel request id generation, gateway trace writer) into shared/infra homes, extract a small app-side `ControlClient` facade, and add a placeholder for the shared `athena-console` protocol frame types. No protocol behavior changes.

**Architecture:** Cleanup-only refactor. (1) New `src/shared/gateway-protocol/athenaConsole.ts` defines transport-neutral console frame types. (2) Channel request id helpers move from `src/gateway/relay/ids.ts` to `src/shared/gateway-protocol/channelRequestId.ts`. (3) Gateway trace writer moves from `src/gateway/transport/trace.ts` to `src/infra/gatewayTrace.ts` (transport-specific `traceGatewayFrame` stays). (4) New `src/app/channels/gatewayControlClient.ts` facade owns endpoint→`ControlClient` connection construction so `sessionBridge.ts` no longer reaches into `gateway/transport/*` or `gateway/control/*` directly. (5) Audit + ESLint rule additions lock in the new boundary for `src/app/channels/**` and `src/app/providers/**`.

**Tech Stack:** TypeScript 5.7, ESM, Vitest, ESLint flat config, tsup. Existing layer rules in `eslint.config.js` already restrict gateway/shared/core; this plan adds new restrictions to the app channel + provider directories.

---

## File Structure

**New files**

- `src/shared/gateway-protocol/athenaConsole.ts` — transport-neutral console frame types (Task C1)
- `src/shared/gateway-protocol/channelRequestId.ts` — relocated id helpers (Task C2)
- `src/shared/gateway-protocol/channelRequestId.test.ts` — relocated test (Task C2)
- `src/infra/gatewayTrace.ts` — relocated `writeGatewayTrace` (Task C4)
- `src/app/channels/gatewayControlClient.ts` — runtime-side facade for `ControlClient` (Task C3)
- `src/app/channels/gatewayControlClient.test.ts` — unit tests for the facade (Task C3)

**Files modified**

- `src/shared/gateway-protocol/index.ts` — add new exports (Tasks C1, C2)
- `src/gateway/relay/coordinator.ts` — import id helper from shared (Task C2)
- `src/gateway/adapters/telegram/verdict.ts` — import id helpers from shared (Task C2)
- `src/app/channels/sessionBridge.ts` — use facade + shared id helper + infra trace (Tasks C2, C3, C4)
- `src/app/channels/sessionBridge.integration.test.ts` — update gateway-internal imports if still needed for fixtures (Task C3)
- `src/app/providers/RuntimeProvider.tsx` — import trace from infra (Task C4)
- `src/app/providers/useFeed.ts` — import trace from infra (Task C4)
- `src/gateway/daemon.ts` — import trace from infra (Task C4)
- `src/gateway/transport/trace.ts` — re-export `writeGatewayTrace` from infra; keep `traceGatewayFrame` (Task C4)
- `eslint.config.js` — add boundary rules for app channels + providers (Task C5)

**Files deleted**

- `src/gateway/relay/ids.ts` (Task C2 — content moved to shared)
- `src/gateway/relay/ids.test.ts` (Task C2 — replaced by shared test)

Each task produces a self-contained commit. Tasks C1–C4 are independent in spirit but share `index.ts`; execute in numeric order to keep diffs trivial.

---

## Task C1: Add shared `athena-console` protocol type home

**Files:**

- Create: `src/shared/gateway-protocol/athenaConsole.ts`
- Modify: `src/shared/gateway-protocol/index.ts`

This task only adds compile-time types. No runtime, no behavior change. Frames are transport-neutral so the future CLI `console` adapter and any rich-client broker (browser, mobile, desktop) can share field shapes.

- [ ] **Step 1: Create the frame types file**

Write `src/shared/gateway-protocol/athenaConsole.ts`:

```typescript
/**
 * Athena console protocol: transport-neutral frame shapes shared between
 * the gateway-side `console` channel adapter and any rich-client broker
 * (browser, mobile, desktop, partner-hosted UI). These are types only;
 * the wire transport (WS, HTTP/2, custom) is broker-specific.
 *
 * This is a placeholder home — the adapter implementation lands in a
 * separate plan. Adding it here now keeps frame shapes in the shared
 * boundary leaf instead of an adapter-private module.
 */

import type {RelayQuestion, RelayQuestionOption} from './relay';

export type AthenaConsoleFrameKind =
	| 'console.hello'
	| 'console.ready'
	| 'console.message.in'
	| 'console.message.out'
	| 'console.permission.request'
	| 'console.permission.response'
	| 'console.question.request'
	| 'console.question.response'
	| 'console.ack'
	| 'console.error';

export type AthenaConsoleAddress = {
	runnerId: string;
	workspaceId?: string;
	conversationId?: string;
	threadId?: string;
	userId?: string;
};

export type AthenaConsoleFrameBase = {
	kind: AthenaConsoleFrameKind;
	/** Monotonic per-connection frame id; used for ack/error refs. */
	frameId: string;
	/** Unix epoch milliseconds. */
	sentAt: number;
};

export type AthenaConsoleHelloFrame = AthenaConsoleFrameBase & {
	kind: 'console.hello';
	protocolVersion: number;
	clientName: string;
	clientVersion: string;
};

export type AthenaConsoleReadyFrame = AthenaConsoleFrameBase & {
	kind: 'console.ready';
	protocolVersion: number;
	brokerName: string;
	address: AthenaConsoleAddress;
};

export type AthenaConsoleInboundMessageFrame = AthenaConsoleFrameBase & {
	kind: 'console.message.in';
	address: AthenaConsoleAddress;
	messageId: string;
	/** Broker-generated idempotency key for at-least-once delivery dedupe. */
	idempotencyKey: string;
	text: string;
};

export type AthenaConsoleOutboundMessageFrame = AthenaConsoleFrameBase & {
	kind: 'console.message.out';
	address: AthenaConsoleAddress;
	messageId: string;
	/** Runtime-generated idempotency key; stable across redeliveries. */
	idempotencyKey: string;
	text: string;
};

export type AthenaConsolePermissionRequestFrame = AthenaConsoleFrameBase & {
	kind: 'console.permission.request';
	address: AthenaConsoleAddress;
	channelRequestId: string;
	toolName: string;
	description: string;
	inputPreview: string;
	ttlMs?: number;
};

export type AthenaConsolePermissionResponseFrame = AthenaConsoleFrameBase & {
	kind: 'console.permission.response';
	channelRequestId: string;
	decision: 'allow' | 'deny';
};

export type AthenaConsoleQuestionRequestFrame = AthenaConsoleFrameBase & {
	kind: 'console.question.request';
	address: AthenaConsoleAddress;
	channelRequestId: string;
	title: string;
	questions: readonly RelayQuestion[];
	ttlMs?: number;
};

export type AthenaConsoleQuestionResponseFrame = AthenaConsoleFrameBase & {
	kind: 'console.question.response';
	channelRequestId: string;
	/**
	 * Mirrors `QuestionRelayResult.answers`: keyed by `RelayQuestion.key`,
	 * value is the chosen option label. Multi-select encoding can be
	 * layered on later if needed (current relay shape is single string per
	 * key).
	 */
	answers: Record<string, string>;
};

export type AthenaConsoleAckFrame = AthenaConsoleFrameBase & {
	kind: 'console.ack';
	refFrameId: string;
};

export type AthenaConsoleErrorFrame = AthenaConsoleFrameBase & {
	kind: 'console.error';
	refFrameId?: string;
	code: string;
	message: string;
};

export type AthenaConsoleFrame =
	| AthenaConsoleHelloFrame
	| AthenaConsoleReadyFrame
	| AthenaConsoleInboundMessageFrame
	| AthenaConsoleOutboundMessageFrame
	| AthenaConsolePermissionRequestFrame
	| AthenaConsolePermissionResponseFrame
	| AthenaConsoleQuestionRequestFrame
	| AthenaConsoleQuestionResponseFrame
	| AthenaConsoleAckFrame
	| AthenaConsoleErrorFrame;

export type {RelayQuestion, RelayQuestionOption};
```

- [ ] **Step 2: Re-export from the shared barrel**

Edit `src/shared/gateway-protocol/index.ts` — add immediately after the `relay` export block at the bottom:

```typescript
export type {
	AthenaConsoleFrameKind,
	AthenaConsoleAddress,
	AthenaConsoleFrameBase,
	AthenaConsoleHelloFrame,
	AthenaConsoleReadyFrame,
	AthenaConsoleInboundMessageFrame,
	AthenaConsoleOutboundMessageFrame,
	AthenaConsolePermissionRequestFrame,
	AthenaConsolePermissionResponseFrame,
	AthenaConsoleQuestionRequestFrame,
	AthenaConsoleQuestionResponseFrame,
	AthenaConsoleAckFrame,
	AthenaConsoleErrorFrame,
	AthenaConsoleFrame,
} from './athenaConsole';
```

- [ ] **Step 3: Verify types compile**

Run:

```bash
npm run typecheck
```

Expected: clean exit. The new types have no runtime users yet; this confirms the discriminated union is well-formed and `RelayQuestion`/`RelayQuestionOption` reach the new file.

- [ ] **Step 4: Commit**

```bash
git add src/shared/gateway-protocol/athenaConsole.ts src/shared/gateway-protocol/index.ts
git commit -m "feat(gateway-protocol): add shared athena-console frame types"
```

---

## Task C2: Move channel request id helpers to shared protocol

**Files:**

- Create: `src/shared/gateway-protocol/channelRequestId.ts`
- Create: `src/shared/gateway-protocol/channelRequestId.test.ts`
- Modify: `src/shared/gateway-protocol/index.ts`
- Modify: `src/gateway/relay/coordinator.ts`
- Modify: `src/gateway/adapters/telegram/verdict.ts`
- Modify: `src/app/channels/sessionBridge.ts`
- Delete: `src/gateway/relay/ids.ts`
- Delete: `src/gateway/relay/ids.test.ts`

Channel request ids are part of the wire protocol shared between adapters and the runtime — they belong in `shared/gateway-protocol`, not under `gateway/relay`.

- [ ] **Step 1: Add the new module (with tests first)**

Create `src/shared/gateway-protocol/channelRequestId.test.ts` (a verbatim copy of the existing `src/gateway/relay/ids.test.ts`, importing from the new path):

```typescript
import {describe, expect, it} from 'vitest';
import {
	CHANNEL_REQUEST_ID_LENGTH,
	generateChannelRequestId,
	isValidChannelRequestId,
} from './channelRequestId';

describe('channel request ids', () => {
	it('generates lowercase 5-char ids in the [a-km-z] alphabet', () => {
		for (let i = 0; i < 200; i++) {
			const id = generateChannelRequestId();
			expect(id).toHaveLength(CHANNEL_REQUEST_ID_LENGTH);
			expect(id).toMatch(/^[a-km-z]{5}$/);
			expect(id.toLowerCase()).toBe(id);
		}
	});

	it('rejects invalid forms', () => {
		expect(isValidChannelRequestId('')).toBe(false);
		expect(isValidChannelRequestId('abcde')).toBe(true);
		expect(isValidChannelRequestId('abcd')).toBe(false);
		expect(isValidChannelRequestId('abcdef')).toBe(false);
		expect(isValidChannelRequestId('Abcde')).toBe(false); // uppercase
		expect(isValidChannelRequestId('abcd1')).toBe(false); // digit
		expect(isValidChannelRequestId('lloyd')).toBe(false); // 'l' excluded
		expect(isValidChannelRequestId('hello')).toBe(false); // 'l' excluded
	});

	it('produces ids without the excluded letter l', () => {
		for (let i = 0; i < 500; i++) {
			expect(generateChannelRequestId()).not.toContain('l');
		}
	});
});
```

- [ ] **Step 2: Run new test to verify it fails**

Run:

```bash
npx vitest run src/shared/gateway-protocol/channelRequestId.test.ts
```

Expected: FAIL — module `./channelRequestId` not found.

- [ ] **Step 3: Create the implementation module**

Write `src/shared/gateway-protocol/channelRequestId.ts` (verbatim move from `src/gateway/relay/ids.ts`):

```typescript
import {randomInt} from 'node:crypto';

/**
 * 25-letter alphabet: a..k (11) + m..z (14), excluding `l` to avoid
 * confusion with `1` and `I` on phone keyboards. Matches Claude Code's
 * channel-request-id alphabet so a portability shim stays straightforward.
 */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyz';

export const CHANNEL_REQUEST_ID_LENGTH = 5;

export const CHANNEL_REQUEST_ID_REGEX = /^[a-km-z]{5}$/;

export function generateChannelRequestId(): string {
	let id = '';
	for (let i = 0; i < CHANNEL_REQUEST_ID_LENGTH; i++) {
		id += ALPHABET[randomInt(ALPHABET.length)];
	}
	return id;
}

export function isValidChannelRequestId(value: string): boolean {
	return CHANNEL_REQUEST_ID_REGEX.test(value);
}
```

- [ ] **Step 4: Run new test to verify it passes**

Run:

```bash
npx vitest run src/shared/gateway-protocol/channelRequestId.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Re-export from the shared barrel**

Edit `src/shared/gateway-protocol/index.ts` — add at the bottom:

```typescript
export {
	CHANNEL_REQUEST_ID_LENGTH,
	CHANNEL_REQUEST_ID_REGEX,
	generateChannelRequestId,
	isValidChannelRequestId,
} from './channelRequestId';
```

- [ ] **Step 6: Update gateway-side imports**

Edit `src/gateway/relay/coordinator.ts` — replace the line:

```typescript
import {generateChannelRequestId} from './ids';
```

with:

```typescript
import {generateChannelRequestId} from '../../shared/gateway-protocol/channelRequestId';
```

Edit `src/gateway/adapters/telegram/verdict.ts` — replace the import block (currently at lines 18–21):

```typescript
import {
	CHANNEL_REQUEST_ID_REGEX,
	isValidChannelRequestId,
} from '../../relay/ids';
```

with:

```typescript
import {
	CHANNEL_REQUEST_ID_REGEX,
	isValidChannelRequestId,
} from '../../../shared/gateway-protocol/channelRequestId';
```

(Verify path depth — `verdict.ts` lives at `src/gateway/adapters/telegram/verdict.ts`, so three `../` reach `src/`.)

- [ ] **Step 7: Update app-side import**

Edit `src/app/channels/sessionBridge.ts` — replace the line:

```typescript
import {generateChannelRequestId} from '../../gateway/relay/ids';
```

with:

```typescript
import {generateChannelRequestId} from '../../shared/gateway-protocol/channelRequestId';
```

- [ ] **Step 8: Delete the old module and its test**

Run:

```bash
git rm src/gateway/relay/ids.ts src/gateway/relay/ids.test.ts
```

- [ ] **Step 9: Run typecheck and the affected tests**

Run:

```bash
npm run typecheck
npx vitest run src/shared/gateway-protocol/channelRequestId.test.ts src/gateway/relay/coordinator.test.ts src/gateway/adapters/telegram src/app/channels/sessionBridge.integration.test.ts
```

Expected: typecheck clean; all listed test files pass with no missing-module errors. (`sessionBridge.integration.test.ts` is the only existing app-channel integration suite; there is no plain `sessionBridge.test.ts`.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(gateway): move channel request id helpers to shared protocol"
```

---

## Task C3: Add app-side gateway control client facade

**Files:**

- Create: `src/app/channels/gatewayControlClient.ts`
- Create: `src/app/channels/gatewayControlClient.test.ts`
- Modify: `src/app/channels/sessionBridge.ts`

Goal: `sessionBridge.ts` should depend on a single app-local facade for connecting a `ControlClient`, not on `gateway/control/client` + `gateway/transport/wsClient` directly. The facade owns endpoint→client construction. `SessionBridge` keeps register/replay/reconnect logic.

The existing private `connectForEndpoint` and `defaultLoadToken` helpers inside `sessionBridge.ts` (lines ~544–569) are the seam — extract them.

- [ ] **Step 1: Write the facade test first**

Create `src/app/channels/gatewayControlClient.test.ts`:

```typescript
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectGatewayControlClient} from './gatewayControlClient';
import {startDaemon, type DaemonHandle} from '../../gateway/daemon';
import type {GatewayPaths} from '../../gateway/paths';

describe('connectGatewayControlClient (local UDS)', () => {
	let dir: string;
	let paths: GatewayPaths;
	let daemon: DaemonHandle | null = null;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-gw-facade-'));
		paths = {
			socketPath: path.join(dir, 'gw.sock'),
			tokenPath: path.join(dir, 'token'),
			pidPath: path.join(dir, 'gw.pid'),
			statePath: path.join(dir, 'state.db'),
		} as GatewayPaths;
		fs.writeFileSync(paths.tokenPath, 'test-token', 'utf8');
	});

	afterEach(async () => {
		if (daemon) await daemon.stop();
		daemon = null;
		fs.rmSync(dir, {recursive: true, force: true});
	});

	it('uses provided loadToken to authenticate over UDS', async () => {
		daemon = await startDaemon({paths, skipChannelLoad: true});
		const loadToken = vi.fn().mockReturnValue('test-token');
		const client = await connectGatewayControlClient({
			endpoint: {mode: 'local'},
			paths,
			loadToken,
		});
		expect(loadToken).toHaveBeenCalledWith(paths.tokenPath);
		client.close();
	});

	it('falls back to reading token from disk when loadToken is omitted', async () => {
		daemon = await startDaemon({paths, skipChannelLoad: true});
		const client = await connectGatewayControlClient({
			endpoint: {mode: 'local'},
			paths,
		});
		client.close();
	});
});
```

(Note: `skipChannelLoad: true` is required by project memory — daemon-booting tests must pass it to avoid hitting real external services.)

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/app/channels/gatewayControlClient.test.ts
```

Expected: FAIL — module `./gatewayControlClient` not found.

- [ ] **Step 3: Create the facade**

Write `src/app/channels/gatewayControlClient.ts`:

```typescript
/**
 * App-side facade for opening a ControlClient against the gateway daemon.
 *
 * Owns the small surface that bridges a `RuntimeEndpoint` to a connected
 * `ControlClient`: local UDS vs remote WS transport selection, token
 * loading, and TLS option wiring. App/runtime callers (SessionBridge,
 * `athena gateway` CLI subcommands, etc.) consume the facade rather than
 * reaching into `gateway/transport/*` or `gateway/control/client`
 * directly.
 *
 * NOTE: This facade is for *runtime/app-side* control-plane connections.
 * The future `console` channel adapter lives under
 * `src/gateway/adapters/console/` and must not import app code; its
 * broker-side client belongs alongside the adapter, not here.
 */

import {readFileSync} from 'node:fs';
import {
	connect,
	GatewayProtocolError,
	type ControlClient,
} from '../../gateway/control/client';
import {resolveGatewayPaths, type GatewayPaths} from '../../gateway/paths';
import {
	createWsClientTransport,
	wsClientOptionsForEndpoint,
} from '../../gateway/transport/wsClient';
import type {RuntimeEndpoint} from '../../shared/gateway-protocol';

export type ConnectGatewayControlClientOptions = {
	endpoint: RuntimeEndpoint;
	paths: GatewayPaths;
	/** Override token loader for tests. Defaults to reading from disk. */
	loadToken?: (tokenPath: string) => string;
};

export async function connectGatewayControlClient(
	opts: ConnectGatewayControlClientOptions,
): Promise<ControlClient> {
	const loadToken = opts.loadToken ?? defaultLoadToken;
	if (opts.endpoint.mode === 'remote') {
		return connect({
			socketPath: opts.paths.socketPath,
			token: opts.endpoint.token,
			transport: createWsClientTransport(
				wsClientOptionsForEndpoint({
					url: opts.endpoint.url,
					tlsCaPath: opts.endpoint.tlsCaPath,
				}),
			),
		});
	}
	return connect({
		socketPath: opts.paths.socketPath,
		token: loadToken(opts.paths.tokenPath),
	});
}

function defaultLoadToken(tokenPath: string): string {
	return readFileSync(tokenPath, 'utf8').trim();
}

export {resolveGatewayPaths, GatewayProtocolError};
export type {ControlClient, GatewayPaths};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx vitest run src/app/channels/gatewayControlClient.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Refactor `sessionBridge.ts` to use the facade**

Edit `src/app/channels/sessionBridge.ts`:

Replace the import block at lines 26–38 (everything between `import {` ...`'../../gateway/control/client'` and `import {readGatewayClientConfig}`) with a single facade-and-shared import:

```typescript
import {
	connectGatewayControlClient,
	GatewayProtocolError,
	resolveGatewayPaths,
	type ControlClient,
	type GatewayPaths,
} from './gatewayControlClient';
import {generateChannelRequestId} from '../../shared/gateway-protocol/channelRequestId';
import {writeGatewayTrace} from '../../gateway/transport/trace';
import {readGatewayClientConfig} from '../../infra/config/gatewayClient';
import {trackGatewayTransportReconnect} from '../../infra/telemetry/events';
```

(The `writeGatewayTrace` import will move to infra in Task C4 — leave the existing path for now.)

Remove the now-unused `readFileSync` import at the bottom (line 64) and the bottom-of-file helpers `defaultLoadToken` (lines 544–546) and `connectForEndpoint` (lines 548–569).

Replace the call site at the top of `connectAndRegister` (around line 478):

```typescript
const client = this.opts.connectClient
	? await this.opts.connectClient(input)
	: this.opts.client && !this.client
		? this.opts.client
		: await connectForEndpoint({
				endpoint: input.endpoint,
				paths: input.paths,
				loadToken: this.opts.loadToken ?? defaultLoadToken,
			});
```

with:

```typescript
const client = this.opts.connectClient
	? await this.opts.connectClient(input)
	: this.opts.client && !this.client
		? this.opts.client
		: await connectGatewayControlClient({
				endpoint: input.endpoint,
				paths: input.paths,
				loadToken: this.opts.loadToken,
			});
```

- [ ] **Step 6: Run focused tests + typecheck**

Run:

```bash
npm run typecheck
npx vitest run src/app/channels/gatewayControlClient.test.ts src/app/channels/sessionBridge.integration.test.ts
```

Expected: typecheck clean; all integration assertions still pass (start/registers, completeTurn, relayPermission, cancelRelayPermission). The facade is a pure refactor — no behavior change.

- [ ] **Step 7: Verify no remaining `gateway/transport/wsClient` or `gateway/control/client` imports in `sessionBridge.ts`**

Run:

```bash
rg "gateway/(transport/wsClient|control/client)" src/app/channels/sessionBridge.ts
```

Expected: no matches.

- [ ] **Step 8: Commit**

```bash
git add src/app/channels/gatewayControlClient.ts src/app/channels/gatewayControlClient.test.ts src/app/channels/sessionBridge.ts
git commit -m "refactor(channels): extract gatewayControlClient facade from SessionBridge"
```

---

## Task C4: Move `writeGatewayTrace` to shared infra

**Files:**

- Create: `src/infra/gatewayTrace.ts`
- Modify: `src/gateway/transport/trace.ts`
- Modify: `src/gateway/daemon.ts`
- Modify: `src/app/channels/sessionBridge.ts`
- Modify: `src/app/providers/RuntimeProvider.tsx`
- Modify: `src/app/providers/useFeed.ts`

`writeGatewayTrace` is a cross-cutting diagnostic helper: app, gateway, and infra all call it. `traceGatewayFrame` and `redactFrame` are transport-specific (they only make sense for control-plane frames) and stay where they are.

Per `eslint.config.js`, `gateway/**` may import from `infra` (line 215), so this move keeps all existing edges legal.

- [ ] **Step 1: Create the infra module**

Write `src/infra/gatewayTrace.ts`:

```typescript
/**
 * Cross-cutting gateway/runtime trace writer. Consumed by gateway daemon,
 * runtime SessionBridge, and the in-process feed/runtime providers. Lives
 * in `infra` (not `gateway/transport`) because it is a diagnostic
 * concern, not a transport-private API.
 *
 * Output is gated on `ATHENA_GATEWAY_TRACE=1`. When set, lines are
 * appended to `ATHENA_GATEWAY_TRACE_FILE` if writable, otherwise stderr.
 */

import fs from 'node:fs';

export function writeGatewayTrace(message: string): void {
	if (process.env['ATHENA_GATEWAY_TRACE'] !== '1') return;
	const line = `athena-gateway: [trace] ${message}\n`;
	const traceFile = process.env['ATHENA_GATEWAY_TRACE_FILE'];
	if (traceFile && traceFile.length > 0) {
		try {
			fs.appendFileSync(traceFile, line, 'utf-8');
			return;
		} catch {
			// fall through to stderr
		}
	}
	process.stderr.write(line);
}
```

- [ ] **Step 2: Reduce `gateway/transport/trace.ts` to transport-private helpers**

Replace the entire contents of `src/gateway/transport/trace.ts` with:

```typescript
import {writeGatewayTrace} from '../../infra/gatewayTrace';

export type GatewayTraceDirection = 'in' | 'out';

export function traceGatewayFrame(
	transport: string,
	peer: string,
	direction: GatewayTraceDirection,
	frame: unknown,
): void {
	if (process.env['ATHENA_GATEWAY_TRACE'] !== '1') return;
	writeGatewayTrace(
		`${transport} ${direction} ${peer} ${JSON.stringify(redactFrame(frame))}`,
	);
}

function redactFrame(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redactFrame);
	if (typeof value !== 'object' || value === null) return value;
	const out: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (key === 'token') {
			out[key] = '<redacted>';
			continue;
		}
		out[key] = redactFrame(child);
	}
	return out;
}
```

(Note: `writeGatewayTrace` is no longer re-exported from this module. Callers must import it from `infra/gatewayTrace` directly.)

- [ ] **Step 3: Update gateway daemon import**

Edit `src/gateway/daemon.ts` — replace the line at line 40:

```typescript
import {writeGatewayTrace} from './transport/trace';
```

with:

```typescript
import {writeGatewayTrace} from '../infra/gatewayTrace';
```

- [ ] **Step 4: Update app-side imports**

Edit `src/app/channels/sessionBridge.ts` — replace:

```typescript
import {writeGatewayTrace} from '../../gateway/transport/trace';
```

with:

```typescript
import {writeGatewayTrace} from '../../infra/gatewayTrace';
```

Edit `src/app/providers/RuntimeProvider.tsx` line 18 — same replacement (path is identical: `'../../gateway/transport/trace'` → `'../../infra/gatewayTrace'`).

Edit `src/app/providers/useFeed.ts` line 37 — same replacement.

- [ ] **Step 5: Run typecheck, lint, and the affected tests**

Run:

```bash
npm run typecheck
npm run lint:eslint
npx vitest run src/app/channels/sessionBridge.integration.test.ts src/gateway/transport/tlsWs.test.ts src/gateway/transport/uds.test.ts
```

Expected: clean typecheck and lint; transport tests still pass (they exercise `traceGatewayFrame` indirectly via `ATHENA_GATEWAY_TRACE`).

- [ ] **Step 6: Confirm no straggling imports**

Run:

```bash
rg "from ['\"].*gateway/transport/trace['\"]" src/
```

Expected: only `src/gateway/transport/trace.ts` itself, and any _re-import within transport_ (e.g., `tlsWs.ts`, `uds.ts`, `framing.ts`) of `traceGatewayFrame`. There must be **zero** matches that mention `writeGatewayTrace`.

Run:

```bash
rg "writeGatewayTrace" src/gateway/transport/trace.ts
```

Expected: one line — the import from `'../../infra/gatewayTrace'` (no export of the symbol from this file).

- [ ] **Step 7: Commit**

```bash
git add src/infra/gatewayTrace.ts src/gateway/transport/trace.ts src/gateway/daemon.ts src/app/channels/sessionBridge.ts src/app/providers/RuntimeProvider.tsx src/app/providers/useFeed.ts
git commit -m "refactor(infra): move writeGatewayTrace out of gateway transport"
```

---

## Task C5: Lock in the new boundary in ESLint

**Files:**

- Modify: `eslint.config.js`

Add `no-restricted-imports` rules to `src/app/channels/**` and `src/app/providers/**` so that future code cannot reach back into `gateway/relay/*` (id helpers now live in shared) or `gateway/transport/trace` (writer now lives in infra). Other gateway internals — `gateway/control/client`, `gateway/transport/wsClient` — remain off-limits to `src/app/channels/**` (the facade owns them) but stay reachable from `src/app/entry/*` for CLI commands.

This rule is intentionally narrow: tasks C1–C4 already removed every offending import, so the rule simply prevents regressions. Tests under each directory are excluded so integration-test fixtures can keep importing `gateway/daemon` etc.

**Important — flat-config rule replacement.** In ESLint flat config, when two matching config blocks both set `no-restricted-imports`, the later block's rule value replaces the earlier one wholesale (the `patterns` array is not concatenated). The repo already defines a global `no-restricted-imports` rule with the `legacyImportPatterns` group at the top of `eslint.config.js`. Any new file-scoped block that does not re-include those legacy patterns silently drops the legacy-shim restriction for those files. The new C5 blocks therefore re-include `legacyImportPatterns` alongside the new boundary patterns. _(The same gap pre-exists in the ui/core/harnesses/channels/gateway/shared blocks — out of scope for this cleanup, but worth opening a follow-up.)_

- [ ] **Step 1: Add the rule blocks**

Edit `eslint.config.js`. Insert two new config blocks immediately _before_ the existing `src/gateway/**` block (currently starting at line 200). Each block mirrors the layered style already used in the file and re-includes `legacyImportPatterns` to preserve the global restriction.

```javascript
	{
		files: ['src/app/channels/**/*.{ts,tsx}'],
		ignores: testFileGlobs,
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: legacyImportPatterns,
							message:
								'Import from new structure boundaries (app/core/harnesses/infra/ui/shared), not legacy shim paths.',
						},
						{
							group: [
								...relativeImportPatterns('gateway/relay'),
								...relativeImportPatterns('gateway/transport/trace'),
								...relativeImportPatterns('gateway/transport/wsClient'),
								...relativeImportPatterns('gateway/control/client'),
							],
							message:
								'Channels must reach the gateway through the gatewayControlClient facade, shared protocol types, or infra helpers — not transport/control/relay internals.',
						},
					],
				},
			],
		},
	},
	{
		files: ['src/app/providers/**/*.{ts,tsx}'],
		ignores: testFileGlobs,
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: legacyImportPatterns,
							message:
								'Import from new structure boundaries (app/core/harnesses/infra/ui/shared), not legacy shim paths.',
						},
						{
							group: [
								...relativeImportPatterns('gateway/relay'),
								...relativeImportPatterns('gateway/transport/trace'),
							],
							message:
								'Providers must import the trace writer from infra/gatewayTrace and channel ids from shared/gateway-protocol.',
						},
					],
				},
			],
		},
	},
```

(Both `legacyImportPatterns` and `relativeImportPatterns` are already defined at the top of `eslint.config.js`; no new helpers needed.)

- [ ] **Step 2: Run lint to confirm clean state**

Run:

```bash
npm run lint:eslint
```

Expected: zero errors. (Tasks C2–C4 removed every now-restricted import.)

- [ ] **Step 3: Smoke-test the rule by reintroducing a forbidden import**

Temporarily edit `src/app/channels/sessionBridge.ts` and add at the top:

```typescript
import {generateChannelRequestId as _scratch} from '../../gateway/relay/channelRequestId'; // intentionally fake path to trigger the pattern
```

Run:

```bash
npm run lint:eslint
```

Expected: ESLint reports the rule message for the new line. **Then revert the change** — this is just a sanity check that the pattern matches.

```bash
git checkout -- src/app/channels/sessionBridge.ts
npm run lint:eslint
```

Expected: clean.

- [ ] **Step 4: Document remaining intentional cross-boundary imports**

Run:

```bash
rg "from ['\\\"](\\.\\./)+gateway/" src/app src/core src/infra src/shared
```

Expected matches (these are intentional — do not remove):

- `src/app/channels/gatewayControlClient.ts` — owns the gateway/control + gateway/transport surface (the facade).
- `src/app/channels/sessionBridge.integration.test.ts` — test fixture; uses gateway internals (`startDaemon`, `Dispatcher`, `RelayCoordinator`, etc.) to spin up a real daemon. Allowed via `testFileGlobs`.
- `src/app/entry/gatewayCommand.ts` and `gatewayCommand.test.ts` — CLI surface for `athena gateway` subcommands; legitimately drives gateway-control directly.

If the search lists anything outside this whitelist, fix it before completing the task.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js
git commit -m "chore(lint): forbid app channel/provider imports of gateway internals"
```

---

## Task C6: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Run all gates**

Run each in order; do not proceed if any fails:

```bash
npm run typecheck
npm run lint:eslint
npm run lint:dead
npm test
npm run build
```

Expected: all green. `lint:dead` (knip) should not flag the new files — the new types and helpers all have at least one consumer (or are exported from the public barrel).

- [ ] **Step 2: Sanity-grep the completion criteria**

Run:

```bash
rg "from ['\"].*gateway/relay/ids['\"]" src/
rg "from ['\"].*gateway/transport/trace['\"]" src/app
```

Expected: no matches in either command. The first confirms the old id module is fully gone; the second confirms app code no longer imports trace from gateway transport.

- [ ] **Step 3: Confirm there are no behavior changes**

Spot-check the integration test once more, isolated:

```bash
npx vitest run src/app/channels/sessionBridge.integration.test.ts
```

Expected: pass. This test exercises register → dispatch → completeTurn → relayPermission → cancelRelayPermission against a real daemon, so its passing is the strongest evidence that the refactor preserved protocol behavior.

- [ ] **Step 4: Final commit (if any auxiliary changes were needed)**

If steps 1–3 surfaced no further edits, this task has nothing to commit. Otherwise commit fixes with a `chore(gateway-cleanup): finalize boundary cleanup` message.

---

## Completion Criteria

All of the following must be true after Task C6:

- `src/gateway/relay/ids.ts` does not exist; `generateChannelRequestId`, `isValidChannelRequestId`, `CHANNEL_REQUEST_ID_REGEX`, and `CHANNEL_REQUEST_ID_LENGTH` live in `src/shared/gateway-protocol/channelRequestId.ts` and are re-exported from the barrel.
- `src/shared/gateway-protocol/athenaConsole.ts` exists with the full `AthenaConsoleFrame` discriminated union and is re-exported from the barrel.
- `writeGatewayTrace` lives in `src/infra/gatewayTrace.ts`. `src/gateway/transport/trace.ts` keeps `traceGatewayFrame` and imports the writer from infra.
- `src/app/channels/gatewayControlClient.ts` is the only app-side module that imports from `gateway/control/client` or `gateway/transport/wsClient`.
- `src/app/channels/sessionBridge.ts` imports gateway internals only via the facade; `gateway/relay`, `gateway/transport/wsClient`, `gateway/control/client`, and `gateway/transport/trace` paths do not appear in it.
- ESLint blocks new offending imports in `src/app/channels/**` and `src/app/providers/**`.
- `npm run typecheck`, `npm run lint:eslint`, `npm run lint:dead`, `npm test`, and `npm run build` all pass.
- Wire protocol behavior is unchanged — the existing `sessionBridge.integration.test.ts` continues to pass without modification (apart from import-path updates).

## Risks And Watchpoints

- **Do not invent a second control protocol.** `AthenaConsoleFrame` is for the rich-client broker bridge that the future `console` adapter will speak — it is not a replacement for `ControlEnvelope`. Keep the two namespaces distinct.
- **Do not move `ChannelAdapter` out of `src/shared/gateway-protocol/adapter.ts`.** That location is already correct.
- **Do not move `traceGatewayFrame` to infra.** It is transport-specific (logs framing direction + peer); only the `writeGatewayTrace` sink is cross-cutting.
- **Keep facade scope minimal.** `gatewayControlClient.ts` only constructs a connected `ControlClient`. `SessionBridge` keeps register/relay/replay/reconnect ownership. Do not relocate reconnect logic in this plan.
- **Do not add `loadToken` plumbing where it isn't already wired.** The optional override exists for tests; preserving the same default (read from `paths.tokenPath`) is essential.
- **`skipChannelLoad: true` on `startDaemon` calls** is a project convention recorded in memory — the new facade test must respect it.
