import {describe, expect, it, vi} from 'vitest';
import {executeRemoteAssignment} from './remoteRunExecutor';
import type {ExecRunOptions} from '../exec/types';
import type {RunStreamClient, RunStreamFrameInput} from './runStreamClient';

describe('executeRemoteAssignment', () => {
	it('runs the assigned prompt and streams exec events back to the dashboard', async () => {
		const sent: unknown[] = [];
		const runExecFn = vi.fn(async (options: ExecRunOptions) => {
			options.stdout?.write(
				JSON.stringify({
					type: 'exec.started',
					ts: 100,
					data: {athenaSessionId: options.athenaSessionId},
				}) + '\n',
			);
			options.stdout?.write(
				JSON.stringify({
					type: 'exec.completed',
					ts: 101,
					data: {success: true, exitCode: 0, finalMessage: 'done'},
				}) + '\n',
			);
			return {
				success: true,
				exitCode: 0,
				athenaSessionId: options.athenaSessionId ?? null,
				adapterSessionId: null,
				finalMessage: 'done',
				tokens: {
					input: null,
					output: null,
					cacheRead: null,
					cacheWrite: null,
					total: null,
					contextSize: null,
					contextWindowSize: null,
				},
				durationMs: 1,
			};
		});

		await executeRemoteAssignment({
			frame: {
				type: 'job_assignment',
				runId: 'run_42',
				runSpec: {
					prompt: 'say hello',
					sessionId: 'athena-run_42',
					workflow: {ref: 'exploratory-testing@0.0.14'},
					timeoutSec: 12,
					env: {FOO: 'bar'},
				},
			},
			client: {
				sendRunEvent: frame => sent.push(frame),
			},
			projectDir: '/tmp/project',
			runExecFn,
			bootstrapRuntimeConfigFn: () => ({
				globalConfig: {
					plugins: [],
					additionalDirectories: [],
					workflowMarketplaceSources: [],
					workflowSelections: {},
				},
				projectConfig: {
					plugins: [],
					additionalDirectories: [],
					workflowMarketplaceSources: [],
					workflowSelections: {},
				},
				harness: 'openai-codex',
				isolationConfig: {preset: 'minimal', additionalDirectories: []},
				workflowRef: 'exploratory-testing',
				workflow: undefined,
				workflowPlan: undefined,
				modelName: null,
				warnings: [],
			}),
			now: () => 999,
		});

		expect(runExecFn).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: 'say hello',
				projectDir: '/tmp/project',
				athenaSessionId: 'athena-run_42',
				json: true,
				timeoutMs: 12_000,
			}),
		);
		expect(sent).toContainEqual(
			expect.objectContaining({
				runId: 'run_42',
				seq: 2,
				kind: 'exec.started',
			}),
		);
		expect(sent).toContainEqual(
			expect.objectContaining({
				runId: 'run_42',
				seq: 3,
				kind: 'completion',
				payload: expect.objectContaining({success: true}),
			}),
		);
	});

	it('sends a terminal error when the assignment has no prompt', async () => {
		const sent: unknown[] = [];

		await executeRemoteAssignment({
			frame: {
				type: 'job_assignment',
				runId: 'run_42',
				runSpec: {sessionId: 'athena-run_42'},
			},
			client: {
				sendRunEvent: frame => sent.push(frame),
			},
			runExecFn: vi.fn(),
		});

		expect(sent).toEqual([
			expect.objectContaining({
				runId: 'run_42',
				seq: 1,
				kind: 'progress',
			}),
			expect.objectContaining({
				runId: 'run_42',
				seq: 2,
				kind: 'error',
				payload: expect.objectContaining({
					message: expect.stringContaining('missing prompt'),
				}),
			}),
		]);
	});

	it('sends a terminal error when runtime bootstrap fails', async () => {
		const sent: unknown[] = [];

		await executeRemoteAssignment({
			frame: {
				type: 'job_assignment',
				runId: 'run_42',
				runSpec: {prompt: 'hello'},
			},
			client: {
				sendRunEvent: frame => sent.push(frame),
			},
			bootstrapRuntimeConfigFn: () => {
				throw new Error('workflow not installed');
			},
			runExecFn: vi.fn(),
			now: () => 123,
		});

		expect(sent).toEqual([
			expect.objectContaining({
				runId: 'run_42',
				seq: 1,
				kind: 'progress',
				payload: {message: 'assignment received'},
			}),
			expect.objectContaining({
				runId: 'run_42',
				seq: 2,
				kind: 'error',
				payload: expect.objectContaining({
					message: 'workflow not installed',
				}),
			}),
		]);
	});

	it('uses the structured exec failure message when the JSON completion is generic', async () => {
		const sent: unknown[] = [];
		const runExecFn = vi.fn(async (options: ExecRunOptions) => {
			options.stdout?.write(
				JSON.stringify({
					type: 'exec.completed',
					ts: 101,
					data: {success: false, exitCode: 4, finalMessage: null},
				}) + '\n',
			);
			return {
				success: false,
				exitCode: 8,
				athenaSessionId: options.athenaSessionId ?? null,
				adapterSessionId: null,
				finalMessage: null,
				tokens: {
					input: null,
					output: null,
					cacheRead: null,
					cacheWrite: null,
					total: null,
					contextSize: null,
					contextWindowSize: null,
				},
				durationMs: 1,
				failure: {
					kind: 'workflow',
					state: 'blocked',
					message: 'Agent did not replace the tracker skeleton.',
				},
			};
		});

		await executeRemoteAssignment({
			frame: {
				type: 'job_assignment',
				runId: 'run_42',
				runSpec: {prompt: 'hello'},
			},
			client: {
				sendRunEvent: frame => sent.push(frame),
			},
			runExecFn,
			bootstrapRuntimeConfigFn: () => ({
				globalConfig: {
					plugins: [],
					additionalDirectories: [],
					workflowMarketplaceSources: [],
					workflowSelections: {},
				},
				projectConfig: {
					plugins: [],
					additionalDirectories: [],
					workflowMarketplaceSources: [],
					workflowSelections: {},
				},
				harness: 'openai-codex',
				isolationConfig: {preset: 'minimal', additionalDirectories: []},
				workflowRef: 'playwright-automation',
				workflow: undefined,
				workflowPlan: undefined,
				modelName: null,
				warnings: [],
			}),
		});

		expect(sent).toContainEqual(
			expect.objectContaining({
				runId: 'run_42',
				kind: 'error',
				payload: expect.objectContaining({
					message: 'Agent did not replace the tracker skeleton.',
				}),
			}),
		);
		expect(
			sent.filter(
				frame =>
					typeof frame === 'object' &&
					frame !== null &&
					(frame as {kind?: unknown}).kind === 'error',
			),
		).toHaveLength(1);
	});

	it('sends a terminal error when exec throws before emitting completion', async () => {
		const sent: unknown[] = [];

		await executeRemoteAssignment({
			frame: {
				type: 'job_assignment',
				runId: 'run_42',
				runSpec: {prompt: 'hello'},
			},
			client: {
				sendRunEvent: frame => sent.push(frame),
			},
			runExecFn: vi.fn(async () => {
				throw new Error('exec crashed');
			}),
			bootstrapRuntimeConfigFn: () => ({
				globalConfig: {
					plugins: [],
					additionalDirectories: [],
					workflowMarketplaceSources: [],
					workflowSelections: {},
				},
				projectConfig: {
					plugins: [],
					additionalDirectories: [],
					workflowMarketplaceSources: [],
					workflowSelections: {},
				},
				harness: 'openai-codex',
				isolationConfig: {preset: 'minimal', additionalDirectories: []},
				workflowRef: undefined,
				workflow: undefined,
				workflowPlan: undefined,
				modelName: null,
				warnings: [],
			}),
		});

		expect(sent).toContainEqual(
			expect.objectContaining({
				runId: 'run_42',
				kind: 'error',
				payload: expect.objectContaining({
					message: 'exec crashed',
				}),
			}),
		);
	});

	// Regression for the dashboard-relay bug: when runSpec includes
	// callbackWsUrl + callbackToken, executor must route every frame through
	// the per-run RunStreamClient. The legacy instance-socket path silently
	// dropped frames during WS reconnects; the per-run channel queues them
	// and replays after resume. This test only verifies routing — the
	// resilience semantics are covered in runStreamClient.test.ts.
	describe('per-run RunStreamDO channel', () => {
		function makeStubRunStreamClient(): {
			client: RunStreamClient;
			sent: Array<RunStreamFrameInput & {seq: number}>;
			connectCalls: number;
			closed: boolean;
		} {
			const sent: Array<RunStreamFrameInput & {seq: number}> = [];
			let nextSeq = 1;
			let connectCalls = 0;
			let closed = false;
			const client: RunStreamClient = {
				connect: () => {
					connectCalls += 1;
					return Promise.resolve();
				},
				sendEvent: input => {
					const seq = nextSeq++;
					sent.push({...input, seq});
					return seq;
				},
				whenTerminated: () => Promise.resolve(),
				close: async () => {
					closed = true;
				},
			};
			return {
				client,
				sent,
				get connectCalls() {
					return connectCalls;
				},
				get closed() {
					return closed;
				},
			};
		}

		it('routes all frames through the per-run client when callback creds are present', async () => {
			const stub = makeStubRunStreamClient();
			const sentToInstanceSocket: unknown[] = [];
			const runExecFn = vi.fn(async (options: ExecRunOptions) => {
				options.stdout?.write(
					JSON.stringify({
						type: 'exec.started',
						ts: 100,
						data: {athenaSessionId: options.athenaSessionId},
					}) + '\n',
				);
				options.stdout?.write(
					JSON.stringify({
						type: 'runtime.event',
						ts: 101,
						data: {kind: 'tool_call'},
					}) + '\n',
				);
				options.stdout?.write(
					JSON.stringify({
						type: 'exec.completed',
						ts: 102,
						data: {success: true, exitCode: 0, finalMessage: 'done'},
					}) + '\n',
				);
				return {
					success: true,
					exitCode: 0,
					athenaSessionId: options.athenaSessionId ?? null,
					adapterSessionId: null,
					finalMessage: 'done',
					tokens: {
						input: null,
						output: null,
						cacheRead: null,
						cacheWrite: null,
						total: null,
						contextSize: null,
						contextWindowSize: null,
					},
					durationMs: 1,
				};
			});

			await executeRemoteAssignment({
				frame: {
					type: 'job_assignment',
					runId: 'run_callback',
					runSpec: {
						prompt: 'go',
						sessionId: 'athena-run_callback',
						callbackWsUrl:
							'wss://dash.example/api/runs/run_callback/stream?token=t',
						callbackToken: 't',
					},
				},
				client: {
					sendRunEvent: frame => sentToInstanceSocket.push(frame),
				},
				runExecFn,
				bootstrapRuntimeConfigFn: () => ({
					globalConfig: {
						plugins: [],
						additionalDirectories: [],
						workflowMarketplaceSources: [],
						workflowSelections: {},
					},
					projectConfig: {
						plugins: [],
						additionalDirectories: [],
						workflowMarketplaceSources: [],
						workflowSelections: {},
					},
					harness: 'openai-codex',
					isolationConfig: {preset: 'minimal', additionalDirectories: []},
					workflowRef: undefined,
					workflow: undefined,
					workflowPlan: undefined,
					modelName: null,
					warnings: [],
				}),
				now: () => 999,
				createRunStreamClientFn: () => stub.client,
			});

			expect(stub.connectCalls).toBe(1);
			expect(stub.closed).toBe(true);
			// Instance-socket relay must NOT receive any run_event frames.
			expect(sentToInstanceSocket).toEqual([]);

			const kinds = stub.sent.map(f => f.kind);
			expect(kinds).toEqual([
				'progress',
				'exec.started',
				'runtime.event',
				'completion',
			]);
			// Sequence numbers come from the per-run client and must be
			// monotonic — RunStreamDO enforces this server-side.
			expect(stub.sent.map(f => f.seq)).toEqual([1, 2, 3, 4]);
		});

		it('falls back to instance socket when per-run connect times out', async () => {
			const sentToInstanceSocket: Array<{kind: string; seq: number}> = [];
			let connectStarted = false;
			let closed = false;
			const stub: RunStreamClient = {
				connect: () => {
					connectStarted = true;
					// Never resolves — simulate a hung connect.
					return new Promise<void>(() => {});
				},
				sendEvent: () => {
					throw new Error('per-run channel should not have been used');
				},
				whenTerminated: () => Promise.resolve(),
				close: async () => {
					closed = true;
				},
			};

			await executeRemoteAssignment({
				frame: {
					type: 'job_assignment',
					runId: 'run_fallback',
					runSpec: {
						prompt: 'go',
						callbackWsUrl:
							'wss://dash.example/api/runs/run_fallback/stream?token=t',
						callbackToken: 't',
					},
				},
				client: {
					sendRunEvent: frame =>
						sentToInstanceSocket.push({kind: frame.kind, seq: frame.seq}),
				},
				runExecFn: vi.fn(async () => ({
					success: true,
					exitCode: 0,
					athenaSessionId: null,
					adapterSessionId: null,
					finalMessage: 'ok',
					tokens: {
						input: null,
						output: null,
						cacheRead: null,
						cacheWrite: null,
						total: null,
						contextSize: null,
						contextWindowSize: null,
					},
					durationMs: 1,
				})),
				bootstrapRuntimeConfigFn: () => ({
					globalConfig: {
						plugins: [],
						additionalDirectories: [],
						workflowMarketplaceSources: [],
						workflowSelections: {},
					},
					projectConfig: {
						plugins: [],
						additionalDirectories: [],
						workflowMarketplaceSources: [],
						workflowSelections: {},
					},
					harness: 'openai-codex',
					isolationConfig: {preset: 'minimal', additionalDirectories: []},
					workflowRef: undefined,
					workflow: undefined,
					workflowPlan: undefined,
					modelName: null,
					warnings: [],
				}),
				createRunStreamClientFn: () => stub,
				runStreamConnectTimeoutMs: 25,
			});

			expect(connectStarted).toBe(true);
			expect(closed).toBe(true); // we proactively close the timed-out attempt
			// Fallback path: legacy seq numbering (1-based, increments on each
			// call), routed via the instance socket.
			expect(sentToInstanceSocket[0]).toEqual({kind: 'progress', seq: 1});
			expect(sentToInstanceSocket.length).toBeGreaterThan(0);
		});
	});

	it('passes cancellation through to exec and reports a terminal error', async () => {
		const sent: unknown[] = [];
		const controller = new AbortController();
		let resolveExec: (value: ExecRunOptions) => void = () => {};
		const execOptions = new Promise<ExecRunOptions>(resolve => {
			resolveExec = resolve;
		});
		const runExecFn = vi.fn(async (options: ExecRunOptions) => {
			resolveExec(options);
			await new Promise<void>(resolve => {
				options.signal?.addEventListener('abort', () => resolve(), {
					once: true,
				});
			});
			return {
				success: false,
				exitCode: 4,
				athenaSessionId: options.athenaSessionId ?? null,
				adapterSessionId: null,
				finalMessage: null,
				tokens: {
					input: null,
					output: null,
					cacheRead: null,
					cacheWrite: null,
					total: null,
					contextSize: null,
					contextWindowSize: null,
				},
				durationMs: 1,
				failure: {
					kind: 'process',
					message: 'Execution cancelled.',
				},
			};
		});

		const pending = executeRemoteAssignment({
			frame: {
				type: 'job_assignment',
				runId: 'run_cancel',
				runSpec: {prompt: 'hello'},
			},
			client: {
				sendRunEvent: frame => sent.push(frame),
			},
			runExecFn,
			bootstrapRuntimeConfigFn: () => ({
				globalConfig: {
					plugins: [],
					additionalDirectories: [],
					workflowMarketplaceSources: [],
					workflowSelections: {},
				},
				projectConfig: {
					plugins: [],
					additionalDirectories: [],
					workflowMarketplaceSources: [],
					workflowSelections: {},
				},
				harness: 'openai-codex',
				isolationConfig: {preset: 'minimal', additionalDirectories: []},
				workflowRef: undefined,
				workflow: undefined,
				workflowPlan: undefined,
				modelName: null,
				warnings: [],
			}),
			abortSignal: controller.signal,
		});

		const options = await execOptions;
		expect(options.signal).toBe(controller.signal);
		controller.abort();
		await pending;

		expect(sent).toContainEqual(
			expect.objectContaining({
				runId: 'run_cancel',
				kind: 'error',
				payload: expect.objectContaining({
					message: 'Execution cancelled.',
				}),
			}),
		);
	});
});
