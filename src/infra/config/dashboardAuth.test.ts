import {describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {refreshDashboardAccessToken} from './dashboardAuth';
import {
	readDashboardClientConfig,
	writeDashboardClientConfig,
} from './dashboardClient';

function jsonResponse(status: number, body: unknown): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
	} as unknown as Response;
}

function withTempHome() {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-dash-auth-'));
	return {HOME: home};
}

describe('refreshDashboardAccessToken', () => {
	it('throws when not paired', async () => {
		const env = withTempHome();
		await expect(refreshDashboardAccessToken({env})).rejects.toThrow(
			/not paired/,
		);
	});

	it('posts refreshToken+fingerprint, rotates stored refresh token, returns access token', async () => {
		const env = withTempHome();
		writeDashboardClientConfig(
			{
				dashboardUrl: 'https://example.com',
				instanceId: 'inst_1',
				refreshToken: 'old-refresh',
				fingerprint: 'fp-1',
				pairedAt: 1,
			},
			env,
		);

		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse(200, {
				instanceId: 'inst_1',
				accessToken: 'fresh-access',
				refreshToken: 'rotated-refresh',
				expiresInSec: 900,
			}),
		);

		const result = await refreshDashboardAccessToken({
			env,
			fetch: fetchMock as unknown as typeof fetch,
			now: () => 5_000,
		});

		expect(result).toEqual({
			accessToken: 'fresh-access',
			instanceId: 'inst_1',
			expiresInSec: 900,
		});
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('https://example.com/api/instances/refresh');
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({
			refreshToken: 'old-refresh',
			fingerprint: 'fp-1',
		});

		const stored = readDashboardClientConfig(env);
		expect(stored?.refreshToken).toBe('rotated-refresh');
		expect(stored?.lastRefreshAt).toBe(5_000);
	});

	it('throws on non-2xx and never leaks refresh token in the message', async () => {
		const env = withTempHome();
		writeDashboardClientConfig(
			{
				dashboardUrl: 'https://example.com',
				instanceId: 'inst_1',
				refreshToken: 'super-secret-refresh',
				fingerprint: 'fp-1',
				pairedAt: 1,
			},
			env,
		);

		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse(401, {error: 'expired'}));
		await expect(
			refreshDashboardAccessToken({
				env,
				fetch: fetchMock as unknown as typeof fetch,
			}),
		).rejects.toMatchObject({
			message: expect.stringMatching(/401/),
		});

		try {
			await refreshDashboardAccessToken({
				env,
				fetch: fetchMock as unknown as typeof fetch,
			});
		} catch (err) {
			expect((err as Error).message).not.toContain('super-secret-refresh');
		}
	});

	it('throws when fetch rejects with a connection error', async () => {
		const env = withTempHome();
		writeDashboardClientConfig(
			{
				dashboardUrl: 'https://example.com',
				instanceId: 'inst_1',
				refreshToken: 'r',
				fingerprint: 'fp-1',
				pairedAt: 1,
			},
			env,
		);

		const fetchMock = vi.fn().mockRejectedValue(new Error('econnrefused'));
		await expect(
			refreshDashboardAccessToken({
				env,
				fetch: fetchMock as unknown as typeof fetch,
			}),
		).rejects.toThrow(/failed to reach https:\/\/example\.com.*econnrefused/);
	});
});
