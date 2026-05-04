import {
	type DashboardClientConfig,
	readDashboardClientConfig,
	writeDashboardClientConfig,
} from './dashboardClient';

export type DashboardAccessToken = {
	accessToken: string;
	instanceId: string;
	expiresInSec: number;
};

export type RefreshDashboardAccessTokenDeps = {
	env?: NodeJS.ProcessEnv;
	fetch?: typeof fetch;
	now?: () => number;
};

/**
 * Reads the dashboard client config, posts to /api/instances/refresh, rotates
 * the stored refresh token, and returns the short-lived access token.
 *
 * Throws if not paired or if refresh fails. The error message does not
 * include the refresh or access token.
 */
export async function refreshDashboardAccessToken(
	deps: RefreshDashboardAccessTokenDeps = {},
): Promise<DashboardAccessToken> {
	const env = deps.env ?? process.env;
	const fetchImpl = deps.fetch ?? fetch;
	const now = deps.now ?? (() => Date.now());

	const config = readDashboardClientConfig(env);
	if (!config) {
		throw new Error(
			'dashboard not paired. Run "athena dashboard pair <token> --url <origin>" first.',
		);
	}

	let response: Response;
	try {
		response = await fetchImpl(`${config.dashboardUrl}/api/instances/refresh`, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				refreshToken: config.refreshToken,
				fingerprint: config.fingerprint,
			}),
		});
	} catch (err) {
		throw new Error(
			`dashboard refresh: failed to reach ${config.dashboardUrl}: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}

	if (!response.ok) {
		let detail = '';
		try {
			detail = await response.text();
		} catch {
			// best-effort
		}
		throw new Error(
			`dashboard refresh: ${config.dashboardUrl} returned ${response.status}` +
				(detail ? ` — ${truncate(detail, 200)}` : ''),
		);
	}

	let parsed: DashboardAccessToken & {refreshToken: string};
	try {
		parsed = parseRefreshResponse(await response.json());
	} catch (err) {
		throw new Error(
			`dashboard refresh: invalid response: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}

	const updated: DashboardClientConfig = {
		...config,
		refreshToken: parsed.refreshToken,
		lastRefreshAt: now(),
	};
	writeDashboardClientConfig(updated, env);

	return {
		accessToken: parsed.accessToken,
		instanceId: parsed.instanceId,
		expiresInSec: parsed.expiresInSec,
	};
}

function parseRefreshResponse(
	raw: unknown,
): DashboardAccessToken & {refreshToken: string} {
	if (typeof raw !== 'object' || raw === null) {
		throw new Error('expected object');
	}
	const obj = raw as Record<string, unknown>;
	const accessToken = obj['accessToken'];
	const refreshToken = obj['refreshToken'];
	const instanceId = obj['instanceId'];
	const expiresInSec = obj['expiresInSec'];
	if (typeof accessToken !== 'string' || accessToken.length === 0) {
		throw new Error('missing accessToken');
	}
	if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
		throw new Error('missing refreshToken');
	}
	if (typeof instanceId !== 'string' || instanceId.length === 0) {
		throw new Error('missing instanceId');
	}
	if (typeof expiresInSec !== 'number') {
		throw new Error('missing expiresInSec');
	}
	return {accessToken, refreshToken, instanceId, expiresInSec};
}

function truncate(text: string, max: number): string {
	return text.length > max ? text.slice(0, max) + '…' : text;
}
