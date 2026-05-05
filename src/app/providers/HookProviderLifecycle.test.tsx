/** @vitest-environment jsdom */
import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import type {
	Runtime,
	RuntimeDecisionHandler,
	RuntimeEventHandler,
	RuntimeStartupError,
} from '../../core/runtime/types';

const createSessionStoreMock = vi.fn();
const sessionsDirMock = vi.fn(() => '/tmp/athena-sessions');
const sessionBridgeStartMock = vi.fn();
const sessionBridgeStopMock = vi.fn();
const sessionBridgeRelayPermissionMock = vi.fn();

vi.mock('../../infra/sessions/store', () => ({
	createSessionStore: (...args: unknown[]) => createSessionStoreMock(...args),
}));

vi.mock('../../infra/sessions/registry', () => ({
	sessionsDir: () => sessionsDirMock(),
}));

vi.mock('../channels/sessionBridge', () => ({
	SessionBridge: class {
		start = sessionBridgeStartMock;
		stop = sessionBridgeStopMock;
		relayPermission = sessionBridgeRelayPermissionMock;
	},
}));

const {HookProvider} = await import('./RuntimeProvider');

function makeRuntime(): Runtime {
	let status: 'stopped' | 'running' = 'stopped';
	let lastError: RuntimeStartupError | null = null;
	return {
		start: vi.fn(() => {
			status = 'running';
			lastError = null;
			return Promise.resolve();
		}),
		stop: vi.fn(() => {
			status = 'stopped';
			lastError = null;
		}),
		getStatus: vi.fn(() => status),
		getLastError: vi.fn(() => lastError),
		onEvent: vi.fn((_handler: RuntimeEventHandler) => () => {}),
		onDecision: vi.fn((_handler: RuntimeDecisionHandler) => () => {}),
		sendDecision: vi.fn(),
	};
}

describe('HookProvider runtime lifecycle', () => {
	beforeEach(() => {
		createSessionStoreMock.mockReset();
		sessionsDirMock.mockClear();
		sessionBridgeStartMock.mockReset();
		sessionBridgeStopMock.mockReset();
		sessionBridgeRelayPermissionMock.mockReset();
		createSessionStoreMock.mockReturnValue({
			close: vi.fn(),
			toBootstrap: vi.fn(() => undefined),
			getRestoredTokens: vi.fn(() => null),
			recordEvent: vi.fn(),
			recordFeedEvents: vi.fn(),
			recordTokens: vi.fn(),
			markDegraded: vi.fn(),
		});
	});

	afterEach(() => {
		cleanup();
	});

	it('keeps runtime running across the async session bridge transition', async () => {
		let resolveBridgeStart: (() => void) | undefined;
		sessionBridgeStartMock.mockImplementationOnce(
			() =>
				new Promise(resolve => {
					resolveBridgeStart = () =>
						resolve({registeredAt: 1, gatewayStartedAt: 1});
				}),
		);
		const runtime = makeRuntime();

		const {unmount} = render(
			<HookProvider
				projectDir="/repo"
				instanceId={1}
				harness="claude-code"
				runtime={runtime}
				athenaSessionId="athena-lifecycle"
			>
				<></>
			</HookProvider>,
		);

		await waitFor(() => expect(runtime.start).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(runtime.onEvent).toHaveBeenCalledTimes(1));
		expect(runtime.stop).not.toHaveBeenCalled();

		await act(async () => {
			resolveBridgeStart?.();
		});

		await waitFor(() => expect(runtime.onEvent).toHaveBeenCalledTimes(2));
		expect(runtime.start).toHaveBeenCalledTimes(1);
		expect(runtime.stop).not.toHaveBeenCalled();

		unmount();
		expect(runtime.stop).toHaveBeenCalledTimes(1);
	});
});
