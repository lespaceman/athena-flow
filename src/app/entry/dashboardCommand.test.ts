import {describe, expect, it, vi} from 'vitest';
import {runDashboardCommand} from './dashboardCommand';
import type {DashboardClientConfig} from '../../infra/config/dashboardClient';
import type {ConsoleChannelConfig} from './dashboardCommand';
import type {StatusResponsePayload} from '../../shared/gateway-protocol';

function captureLogs() {
	const out: string[] = [];
	const err: string[] = [];
	return {
		out,
		err,
		logOut: (m: string) => out.push(m),
		logError: (m: string) => err.push(m),
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
	} as unknown as Response;
}

const STATIC_FINGERPRINT = 'fp-static';

function makeDeps(overrides: {
	fetchMock?: ReturnType<typeof vi.fn>;
	stored?: DashboardClientConfig | null;
	written?: DashboardClientConfig[];
	consoleWrites?: ConsoleChannelConfig[];
	reloadGatewayChannels?: ReturnType<typeof vi.fn>;
	consoleConfig?: ConsoleChannelConfig | null;
	gatewayStatus?: ReturnType<typeof vi.fn>;
	removed?: {count: number};
	now?: number;
}) {
	const writes = overrides.written ?? [];
	const consoleWrites = overrides.consoleWrites ?? [];
	const stored = {value: overrides.stored ?? null};
	const removed = overrides.removed ?? {count: 0};
	const cap = captureLogs();
	return {
		cap,
		writes,
		stored,
		removed,
		deps: {
			fetch: overrides.fetchMock as unknown as typeof fetch,
			now: () => overrides.now ?? 1_700_000_000_000,
			fingerprint: () => STATIC_FINGERPRINT,
			hostInfo: () => ({
				hostname: 'test-host',
				user: 'tester',
				name: 'test-host',
			}),
			packageVersion: '9.9.9-test',
			readConfig: () => stored.value,
			writeConfig: (c: DashboardClientConfig) => {
				stored.value = c;
				writes.push(c);
			},
			removeConfig: () => {
				stored.value = null;
				removed.count += 1;
			},
			writeConsoleChannelConfig: (config: ConsoleChannelConfig) => {
				consoleWrites.push(config);
			},
			readConsoleChannelConfig: () => overrides.consoleConfig ?? null,
			reloadGatewayChannels:
				overrides.reloadGatewayChannels ??
				vi.fn(async () => ({
					ok: true,
					message: 'reloaded',
				})),
			getGatewayStatus:
				overrides.gatewayStatus ??
				vi.fn(async () => ({
					ok: false,
					message: 'gateway not reachable',
				})),
			configPath: () => '/tmp/athena/dashboard.json',
			logOut: cap.logOut,
			logError: cap.logError,
		},
	};
}

describe('runDashboardCommand: usage', () => {
	it('prints usage on no subcommand', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{subcommand: '', subcommandArgs: [], flags: {}},
			deps,
		);
		expect(code).toBe(0);
		expect(cap.out.join('\n')).toContain('Usage: athena dashboard');
	});

	it('prints usage on help', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{subcommand: 'help', subcommandArgs: [], flags: {}},
			deps,
		);
		expect(code).toBe(0);
		expect(cap.out.join('\n')).toContain('Usage: athena dashboard');
	});

	it('rejects unknown subcommand', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{subcommand: 'wat', subcommandArgs: [], flags: {}},
			deps,
		);
		expect(code).toBe(2);
		expect(cap.err.join('\n')).toContain('Unknown dashboard subcommand');
	});
});

describe('runDashboardCommand: pair', () => {
	it('requires a pairing token', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{
				subcommand: 'pair',
				subcommandArgs: [],
				flags: {url: 'http://localhost:5173'},
			},
			deps,
		);
		expect(code).toBe(2);
		expect(cap.err.join('\n')).toContain('missing pairing token');
	});

	it('requires --url', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{subcommand: 'pair', subcommandArgs: ['tok_1'], flags: {}},
			deps,
		);
		expect(code).toBe(2);
		expect(cap.err.join('\n')).toContain('--url');
	});

	it('rejects malformed --url', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{
				subcommand: 'pair',
				subcommandArgs: ['tok_1'],
				flags: {url: 'ws://nope'},
			},
			deps,
		);
		expect(code).toBe(2);
		expect(cap.err.join('\n')).toContain('http:// or https://');
	});

	it('posts to /api/instances/pair with fingerprint, hostInfo, capabilities', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse(200, {
				instanceId: 'inst_1',
				refreshToken: 'refresh_1',
				jti: 'jti_1',
			}),
		);
		const {deps, writes} = makeDeps({fetchMock});

		const code = await runDashboardCommand(
			{
				subcommand: 'pair',
				subcommandArgs: ['tok_1'],
				flags: {url: 'http://localhost:5173/app/instances'},
			},
			deps,
		);

		expect(code).toBe(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('http://localhost:5173/api/instances/pair');
		const reqBody = JSON.parse((init as RequestInit).body as string);
		expect(reqBody).toMatchObject({
			token: 'tok_1',
			fingerprint: STATIC_FINGERPRINT,
			hostInfo: {hostname: 'test-host'},
			capabilities: {
				instanceSocket: true,
				consoleAdapter: true,
				version: '9.9.9-test',
			},
		});
		expect(writes).toHaveLength(1);
		expect(writes[0]).toEqual({
			dashboardUrl: 'http://localhost:5173',
			instanceId: 'inst_1',
			refreshToken: 'refresh_1',
			fingerprint: STATIC_FINGERPRINT,
			pairedAt: 1_700_000_000_000,
		});
	});

	it('does not log refresh token in human output', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse(200, {
				instanceId: 'inst_1',
				refreshToken: 'super-secret-refresh',
			}),
		);
		const {deps, cap} = makeDeps({fetchMock});

		await runDashboardCommand(
			{
				subcommand: 'pair',
				subcommandArgs: ['tok_1'],
				flags: {url: 'http://localhost:5173'},
			},
			deps,
		);

		const everything = [...cap.out, ...cap.err].join('\n');
		expect(everything).not.toContain('super-secret-refresh');
		expect(cap.out.join('\n')).toContain(
			'paired to http://localhost:5173 as inst_1',
		);
	});

	it('reports HTTP error and exits 1 without writing config', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse(401, {error: 'invalid token'}));
		const {deps, cap, writes} = makeDeps({fetchMock});

		const code = await runDashboardCommand(
			{
				subcommand: 'pair',
				subcommandArgs: ['bad_token'],
				flags: {url: 'http://localhost:5173'},
			},
			deps,
		);

		expect(code).toBe(1);
		expect(writes).toHaveLength(0);
		expect(cap.err.join('\n')).toContain('401');
		expect(cap.err.join('\n')).toContain('invalid token');
	});

	it('rejects malformed pair response', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse(200, {instanceId: 'i_1'}));
		const {deps, cap, writes} = makeDeps({fetchMock});

		const code = await runDashboardCommand(
			{
				subcommand: 'pair',
				subcommandArgs: ['tok_1'],
				flags: {url: 'http://localhost:5173'},
			},
			deps,
		);

		expect(code).toBe(1);
		expect(writes).toHaveLength(0);
		expect(cap.err.join('\n')).toContain('invalid response');
	});

	it('emits structured JSON when --json is set', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse(200, {
				instanceId: 'inst_1',
				refreshToken: 'refresh_1',
			}),
		);
		const {deps, cap} = makeDeps({fetchMock});

		await runDashboardCommand(
			{
				subcommand: 'pair',
				subcommandArgs: ['tok_1'],
				flags: {url: 'http://localhost:5173', json: true},
			},
			deps,
		);

		const parsed = JSON.parse(cap.out.join('\n'));
		expect(parsed).toMatchObject({
			ok: true,
			instanceId: 'inst_1',
			dashboardUrl: 'http://localhost:5173',
		});
		// JSON pair output must not contain the refresh token.
		expect(cap.out.join('\n')).not.toContain('refresh_1');
	});
});

describe('runDashboardCommand: doctor', () => {
	const stored: DashboardClientConfig = {
		dashboardUrl: 'http://localhost:3000',
		instanceId: 'inst_1',
		refreshToken: 'do-not-print',
		fingerprint: 'fp-stored',
		pairedAt: 1,
	};

	function gatewayStatus(
		overrides: Partial<StatusResponsePayload> = {},
	): StatusResponsePayload {
		return {
			daemonPid: 123,
			startedAt: 1,
			uptimeMs: 2,
			version: '9.9.9',
			listener: {
				kind: 'uds',
				socketPath: '/tmp/gateway.sock',
			},
			channels: [],
			runtimes: [],
			...overrides,
		};
	}

	it('labels pairing as failed when the CLI is not paired', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{
				subcommand: 'doctor',
				subcommandArgs: ['--runner', 'runner_1'],
				flags: {},
			},
			deps,
		);

		expect(code).toBe(1);
		expect(cap.out.join('\n')).toContain('pairing: fail');
		expect(cap.out.join('\n')).toContain('not paired');
	});

	it('reports healthy pairing, gateway, console adapter, and runtime planes', async () => {
		const {deps, cap} = makeDeps({
			stored,
			consoleConfig: {
				broker_url: 'ws://localhost:3000/api/runners/runner_1/console/adapter',
				runner_id: 'runner_1',
				dashboard_config: true,
			},
			gatewayStatus: vi.fn(async () => ({
				ok: true,
				status: gatewayStatus({
					channels: [{id: 'console', state: 'running'}],
					runtimes: [
						{
							runtimeId: 'runtime-1',
							defaultAgentId: 'main',
							pid: 1234,
							registeredAt: 10,
							binding: {
								state: 'active',
								boundAt: 10,
								lastRebindAt: 15,
								epoch: 1,
							},
							pendingDispatchCount: 0,
						},
					],
				}),
			})),
		});

		const code = await runDashboardCommand(
			{
				subcommand: 'doctor',
				subcommandArgs: ['--runner', 'runner_1'],
				flags: {},
			},
			deps,
		);

		expect(code).toBe(0);
		const out = cap.out.join('\n');
		expect(out).toContain('pairing: ok');
		expect(out).toContain('console-sidecar: ok');
		expect(out).toContain('gateway: ok');
		expect(out).toContain('console-adapter: ok');
		expect(out).toContain('runtime: ok');
		expect(out).not.toContain('do-not-print');
	});

	it('flags a console sidecar runner mismatch before blaming the gateway', async () => {
		const {deps, cap} = makeDeps({
			stored,
			consoleConfig: {
				broker_url:
					'ws://localhost:3000/api/runners/other_runner/console/adapter',
				runner_id: 'other_runner',
				dashboard_config: true,
			},
			gatewayStatus: vi.fn(async () => ({
				ok: true,
				status: gatewayStatus(),
			})),
		});

		const code = await runDashboardCommand(
			{
				subcommand: 'doctor',
				subcommandArgs: ['--runner', 'runner_1'],
				flags: {},
			},
			deps,
		);

		expect(code).toBe(1);
		expect(cap.out.join('\n')).toContain('console-sidecar: fail');
		expect(cap.out.join('\n')).toContain('linked to other_runner');
	});

	it('emits token-free JSON diagnostics', async () => {
		const {deps, cap} = makeDeps({stored});

		const code = await runDashboardCommand(
			{subcommand: 'doctor', subcommandArgs: [], flags: {json: true}},
			deps,
		);

		expect(code).toBe(1);
		const parsed = JSON.parse(cap.out.join('\n'));
		expect(parsed.ok).toBe(false);
		expect(parsed.planes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({plane: 'pairing', ok: true}),
				expect.objectContaining({plane: 'gateway', ok: false}),
			]),
		);
		expect(cap.out.join('\n')).not.toContain('do-not-print');
	});
});

describe('runDashboardCommand: refresh', () => {
	const stored: DashboardClientConfig = {
		dashboardUrl: 'https://example.com',
		instanceId: 'inst_1',
		refreshToken: 'old-refresh',
		fingerprint: 'fp-stored',
		pairedAt: 1,
	};

	it('errors when not paired', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{subcommand: 'refresh', subcommandArgs: [], flags: {}},
			deps,
		);
		expect(code).toBe(1);
		expect(cap.err.join('\n')).toContain('not paired');
	});

	it('delegates to refreshDashboardAccessToken and rotates stored refresh token', async () => {
		const performRefresh = vi.fn().mockImplementation(async () => {
			// The shared helper rotates the on-disk refresh token before
			// returning. Mirror that here so the JSON output sees the new value.
			return {
				instanceId: 'inst_1',
				accessToken: 'access-1',
				expiresInSec: 900,
			};
		});
		const {deps, writes, stored: storedRef} = makeDeps({stored, now: 5_000});
		// Pretend the helper rotated the on-disk value.
		const rotateStored = () => {
			storedRef.value = {...storedRef.value!, refreshToken: 'new-refresh'};
			writes.push(storedRef.value!);
		};
		const code = await runDashboardCommand(
			{subcommand: 'refresh', subcommandArgs: [], flags: {}},
			{
				...deps,
				performRefresh: async label => {
					rotateStored();
					return performRefresh(label);
				},
			},
		);
		expect(code).toBe(0);
		expect(performRefresh).toHaveBeenCalledTimes(1);
		expect(performRefresh.mock.calls[0]![0]).toBe('refresh');
		expect(writes).toHaveLength(1);
		expect(writes[0]?.refreshToken).toBe('new-refresh');
	});

	it('does not print tokens in human output', async () => {
		const {deps, cap} = makeDeps({stored});
		await runDashboardCommand(
			{subcommand: 'refresh', subcommandArgs: [], flags: {}},
			{
				...deps,
				performRefresh: async () => ({
					instanceId: 'inst_1',
					accessToken: 'super-access',
					expiresInSec: 900,
				}),
			},
		);
		const out = cap.out.join('\n');
		expect(out).not.toContain('super-access');
		expect(out).toContain('refreshed access token for instance inst_1');
	});

	it('emits access token and rotated refresh token only when --json is set', async () => {
		const {deps, cap, stored: storedRef} = makeDeps({stored});
		await runDashboardCommand(
			{subcommand: 'refresh', subcommandArgs: [], flags: {json: true}},
			{
				...deps,
				performRefresh: async () => {
					storedRef.value = {
						...storedRef.value!,
						refreshToken: 'new-refresh',
					};
					return {
						instanceId: 'inst_1',
						accessToken: 'access-1',
						expiresInSec: 900,
					};
				},
			},
		);
		const parsed = JSON.parse(cap.out.join('\n'));
		expect(parsed).toMatchObject({
			ok: true,
			instanceId: 'inst_1',
			accessToken: 'access-1',
			refreshToken: 'new-refresh',
			expiresInSec: 900,
		});
	});

	it('reports refresh errors and exits 1', async () => {
		const {deps, cap} = makeDeps({stored});
		const code = await runDashboardCommand(
			{subcommand: 'refresh', subcommandArgs: [], flags: {}},
			{
				...deps,
				performRefresh: async () => {
					throw new Error(
						'dashboard refresh: https://example.com returned 503',
					);
				},
			},
		);
		expect(code).toBe(1);
		expect(cap.err.join('\n')).toContain('503');
	});
});

describe('runDashboardCommand: status', () => {
	it('reports not paired', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{subcommand: 'status', subcommandArgs: [], flags: {}},
			deps,
		);
		expect(code).toBe(1);
		expect(cap.out.join('\n')).toContain('not paired');
	});

	it('prints instance id and origin without tokens', async () => {
		const stored: DashboardClientConfig = {
			dashboardUrl: 'https://example.com',
			instanceId: 'inst_1',
			refreshToken: 'do-not-print',
			fingerprint: 'fp-stored',
			pairedAt: 1,
		};
		const {deps, cap} = makeDeps({stored});

		const code = await runDashboardCommand(
			{subcommand: 'status', subcommandArgs: [], flags: {}},
			deps,
		);
		expect(code).toBe(0);
		expect(cap.out.join('\n')).toContain(
			'paired to https://example.com as inst_1',
		);
		expect(cap.out.join('\n')).not.toContain('do-not-print');
	});

	it('emits JSON without tokens', async () => {
		const stored: DashboardClientConfig = {
			dashboardUrl: 'https://example.com',
			instanceId: 'inst_1',
			refreshToken: 'do-not-print',
			fingerprint: 'fp-stored',
			pairedAt: 1,
			lastRefreshAt: 2,
		};
		const {deps, cap} = makeDeps({stored});

		await runDashboardCommand(
			{subcommand: 'status', subcommandArgs: [], flags: {json: true}},
			deps,
		);
		const parsed = JSON.parse(cap.out.join('\n'));
		expect(parsed).toMatchObject({
			ok: true,
			paired: true,
			instanceId: 'inst_1',
			dashboardUrl: 'https://example.com',
			lastRefreshAt: 2,
		});
		expect(cap.out.join('\n')).not.toContain('do-not-print');
	});
});

describe('runDashboardCommand: connect', () => {
	const stored: DashboardClientConfig = {
		dashboardUrl: 'https://example.com',
		instanceId: 'inst_1',
		refreshToken: 'old-refresh',
		fingerprint: 'fp-stored',
		pairedAt: 1,
	};

	const happyRefresh = async () => ({
		instanceId: 'inst_1',
		accessToken: 'fresh-access',
		expiresInSec: 900,
	});

	function makeFakeSocket() {
		const calls = {
			connect: 0,
			closed: [] as string[],
			runEvents: [] as unknown[],
		};
		const closeHandlers: Array<(reason: string) => void> = [];
		const frameHandlers: Array<(frame: unknown) => void> = [];
		let lastOpts: {
			dashboardUrl: string;
			instanceId: string;
			accessToken: string;
		} | null = null;
		const factory = (o: {
			dashboardUrl: string;
			instanceId: string;
			accessToken: string;
		}) => {
			lastOpts = o;
			return {
				connect: async () => {
					calls.connect += 1;
				},
				close: (reason?: string) => {
					calls.closed.push(reason ?? '');
				},
				onFrame: (handler: (frame: unknown) => void) => {
					frameHandlers.push(handler);
				},
				onClose: (handler: (reason: string) => void) => {
					closeHandlers.push(handler);
				},
				sendRunEvent: (frame: unknown) => {
					calls.runEvents.push(frame);
				},
			};
		};
		return {
			factory,
			calls,
			lastOpts: () => lastOpts,
			emitClose: (reason: string) => {
				for (const h of closeHandlers) h(reason);
			},
			emitFrame: (frame: unknown) => {
				for (const h of frameHandlers) h(frame);
			},
		};
	}

	it('errors when not paired', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{subcommand: 'connect', subcommandArgs: [], flags: {}},
			deps,
		);
		expect(code).toBe(1);
		expect(cap.err.join('\n')).toContain('not paired');
	});

	it('refreshes an access token before opening the socket', async () => {
		const fakeSocket = makeFakeSocket();
		const {deps, cap} = makeDeps({stored});
		const code = await runDashboardCommand(
			{subcommand: 'connect', subcommandArgs: [], flags: {}},
			{
				...deps,
				performRefresh: happyRefresh,
				makeInstanceSocketClient: fakeSocket.factory,
				waitForShutdown: async () => 'SIGINT',
			},
		);

		expect(code).toBe(0);
		expect(fakeSocket.calls.connect).toBe(1);
		expect(fakeSocket.lastOpts()).toEqual({
			dashboardUrl: 'https://example.com',
			instanceId: 'inst_1',
			accessToken: 'fresh-access',
			log: expect.any(Function),
		});
		expect(cap.out.join('\n')).toContain('connected instance inst_1');
		expect(cap.out.join('\n')).toContain('disconnected (SIGINT)');
	});

	it('exits 1 when refresh fails and never opens socket', async () => {
		const fakeSocket = makeFakeSocket();
		const {deps} = makeDeps({stored});
		const code = await runDashboardCommand(
			{subcommand: 'connect', subcommandArgs: [], flags: {}},
			{
				...deps,
				performRefresh: async () => {
					throw new Error('expired');
				},
				makeInstanceSocketClient: fakeSocket.factory,
				waitForShutdown: async () => 'SIGINT',
			},
		);
		expect(code).toBe(1);
		expect(fakeSocket.calls.connect).toBe(0);
	});

	it('exits 1 when the socket closes before the shutdown signal', async () => {
		const fakeSocket = makeFakeSocket();
		const {deps, cap} = makeDeps({stored});

		const pending = runDashboardCommand(
			{subcommand: 'connect', subcommandArgs: [], flags: {}},
			{
				...deps,
				performRefresh: happyRefresh,
				makeInstanceSocketClient: fakeSocket.factory,
				waitForShutdown: () => new Promise<string>(() => {}),
			},
		);
		// Yield until runDashboardCommand has subscribed to onClose.
		await new Promise(r => setTimeout(r, 0));
		await new Promise(r => setTimeout(r, 0));
		fakeSocket.emitClose('server gone');

		const code = await pending;
		expect(code).toBe(1);
		expect(cap.err.join('\n')).toContain('socket closed unexpectedly');
		expect(cap.err.join('\n')).toContain('server gone');
	});

	it('executes job assignments received from the dashboard socket', async () => {
		const fakeSocket = makeFakeSocket();
		const executeRemoteAssignment = vi.fn(async () => {});
		const {deps} = makeDeps({stored});

		const pending = runDashboardCommand(
			{subcommand: 'connect', subcommandArgs: [], flags: {}},
			{
				...deps,
				performRefresh: happyRefresh,
				makeInstanceSocketClient: fakeSocket.factory,
				executeRemoteAssignment,
				waitForShutdown: () => new Promise<string>(() => {}),
			},
		);
		await vi.waitFor(() => expect(fakeSocket.calls.connect).toBe(1));

		fakeSocket.emitFrame({
			type: 'job_assignment',
			runId: 'run_42',
			runSpec: {prompt: 'hello'},
		});

		await vi.waitFor(() => expect(executeRemoteAssignment).toHaveBeenCalled());
		expect(executeRemoteAssignment).toHaveBeenCalledWith(
			expect.objectContaining({
				client: expect.any(Object),
				frame: expect.objectContaining({
					type: 'job_assignment',
					runId: 'run_42',
				}),
			}),
		);
		fakeSocket.emitClose('done');
		await pending;
	});

	it('does not drop job assignments emitted during socket connect', async () => {
		const executeRemoteAssignment = vi.fn(async () => {});
		const {deps} = makeDeps({stored});
		let frameHandler: ((frame: unknown) => void) | undefined;
		let closeHandler: ((reason: string) => void) | undefined;

		const pending = runDashboardCommand(
			{subcommand: 'connect', subcommandArgs: [], flags: {}},
			{
				...deps,
				performRefresh: happyRefresh,
				makeInstanceSocketClient: () => ({
					connect: async () => {
						frameHandler?.({
							type: 'job_assignment',
							runId: 'run_during_connect',
							runSpec: {prompt: 'hello'},
						});
					},
					close: () => {},
					onFrame: handler => {
						frameHandler = handler as (frame: unknown) => void;
					},
					onClose: handler => {
						closeHandler = handler;
					},
					sendRunEvent: () => {},
				}),
				executeRemoteAssignment,
				waitForShutdown: () => new Promise<string>(() => {}),
			},
		);

		await vi.waitFor(() => expect(executeRemoteAssignment).toHaveBeenCalled());
		expect(executeRemoteAssignment).toHaveBeenCalledWith(
			expect.objectContaining({
				frame: expect.objectContaining({runId: 'run_during_connect'}),
			}),
		);
		closeHandler?.('done');
		await pending;
	});

	it('reports socket connect failure and exits 1', async () => {
		const {deps, cap} = makeDeps({stored});
		const code = await runDashboardCommand(
			{subcommand: 'connect', subcommandArgs: [], flags: {}},
			{
				...deps,
				performRefresh: happyRefresh,
				makeInstanceSocketClient: () => ({
					connect: async () => {
						throw new Error('refused');
					},
					close: () => {},
					onFrame: () => {},
					onClose: () => {},
				}),
				waitForShutdown: async () => 'SIGINT',
			},
		);
		expect(code).toBe(1);
		expect(cap.err.join('\n')).toContain('refused');
	});
});

describe('runDashboardCommand: console link', () => {
	const stored: DashboardClientConfig = {
		dashboardUrl: 'http://localhost:3000',
		instanceId: 'inst_1',
		refreshToken: 'do-not-print',
		fingerprint: 'fp-stored',
		pairedAt: 1,
	};

	it('requires an existing dashboard pairing', async () => {
		const {deps, cap} = makeDeps({});
		const code = await runDashboardCommand(
			{subcommand: 'console', subcommandArgs: ['link', 'runner_1'], flags: {}},
			deps,
		);
		expect(code).toBe(1);
		expect(cap.err.join('\n')).toContain('not paired');
	});

	it('writes a console sidecar from the paired dashboard URL and reloads gateway channels', async () => {
		const reloadGatewayChannels = vi.fn(async () => ({
			ok: true,
			message: 'loaded console',
		}));
		const consoleWrites: ConsoleChannelConfig[] = [];
		const {deps, cap} = makeDeps({
			stored,
			consoleWrites,
			reloadGatewayChannels,
		});

		const code = await runDashboardCommand(
			{subcommand: 'console', subcommandArgs: ['link', 'runner_1'], flags: {}},
			deps,
		);

		expect(code).toBe(0);
		expect(consoleWrites).toEqual([
			{
				broker_url: 'ws://localhost:3000/api/runners/runner_1/console/adapter',
				runner_id: 'runner_1',
				dashboard_config: true,
			},
		]);
		expect(reloadGatewayChannels).toHaveBeenCalledTimes(1);
		expect(cap.out.join('\n')).toContain('console linked runner runner_1');
		expect(cap.out.join('\n')).toContain('gateway channels reloaded');
		expect([...cap.out, ...cap.err].join('\n')).not.toContain('do-not-print');
	});

	it('derives wss broker URLs for https dashboards', async () => {
		const consoleWrites: ConsoleChannelConfig[] = [];
		const {deps} = makeDeps({
			stored: {...stored, dashboardUrl: 'https://app.example.com'},
			consoleWrites,
		});

		const code = await runDashboardCommand(
			{subcommand: 'console', subcommandArgs: ['link', 'runner_1'], flags: {}},
			deps,
		);

		expect(code).toBe(0);
		expect(consoleWrites[0]?.broker_url).toBe(
			'wss://app.example.com/api/runners/runner_1/console/adapter',
		);
	});

	it('keeps the sidecar write when gateway reload is unavailable', async () => {
		const consoleWrites: ConsoleChannelConfig[] = [];
		const {deps, cap} = makeDeps({
			stored,
			consoleWrites,
			reloadGatewayChannels: vi.fn(async () => ({
				ok: false,
				message: 'gateway not reachable',
			})),
		});

		const code = await runDashboardCommand(
			{subcommand: 'console', subcommandArgs: ['link', 'runner_1'], flags: {}},
			deps,
		);

		expect(code).toBe(0);
		expect(consoleWrites).toHaveLength(1);
		expect(cap.err.join('\n')).toContain('gateway not reachable');
		expect(cap.out.join('\n')).toContain('start or reload the gateway');
	});
});

describe('runDashboardCommand: unpair', () => {
	it('removes config and is idempotent', async () => {
		const stored: DashboardClientConfig = {
			dashboardUrl: 'https://example.com',
			instanceId: 'inst_1',
			refreshToken: 'tok',
			fingerprint: 'fp',
			pairedAt: 1,
		};
		const {deps, cap, removed} = makeDeps({stored});

		const code = await runDashboardCommand(
			{subcommand: 'unpair', subcommandArgs: [], flags: {}},
			deps,
		);
		expect(code).toBe(0);
		expect(removed.count).toBe(1);
		expect(cap.out.join('\n')).toContain('unpaired');
	});
});
