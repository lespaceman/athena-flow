export type LocalEndpoint = {
	mode: 'local';
};

export type RemoteEndpoint = {
	mode: 'remote';
	url: string;
	token: string;
	tlsCaPath?: string;
};

export type RuntimeEndpoint = LocalEndpoint | RemoteEndpoint;

export function parseRuntimeEndpoint(value: unknown): RuntimeEndpoint {
	if (!isRecord(value)) {
		throw new Error('gateway client config must be an object');
	}
	if (value['mode'] === 'local') {
		return {mode: 'local'};
	}
	if (value['mode'] !== 'remote') {
		throw new Error('gateway client config mode must be local or remote');
	}
	const url = value['url'];
	const token = value['token'];
	const tlsCaPath = value['tlsCaPath'];
	if (typeof url !== 'string' || url.trim().length === 0) {
		throw new Error(
			'gateway client config remote.url must be a non-empty string',
		);
	}
	if (!isSupportedGatewayUrl(url)) {
		throw new Error(
			'gateway client config remote.url must use ws:// or wss://',
		);
	}
	if (typeof token !== 'string' || token.length === 0) {
		throw new Error(
			'gateway client config remote.token must be a non-empty string',
		);
	}
	if (tlsCaPath !== undefined && typeof tlsCaPath !== 'string') {
		throw new Error('gateway client config remote.tlsCaPath must be a string');
	}
	return {
		mode: 'remote',
		url,
		token,
		...(tlsCaPath !== undefined ? {tlsCaPath} : {}),
	};
}

export function isSupportedGatewayUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
	} catch {
		return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
