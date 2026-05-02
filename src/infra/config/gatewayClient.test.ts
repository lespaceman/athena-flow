import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	readGatewayClientConfig,
	resolveGatewayClientConfigPath,
	writeGatewayClientConfig,
} from './gatewayClient';

describe('gateway client config', () => {
	it('defaults to local mode when gateway.json is missing', () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-gw-client-'));

		expect(readGatewayClientConfig({HOME: home})).toEqual({mode: 'local'});
	});

	it('round-trips remote endpoint config with 0600 file mode', () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-gw-client-'));
		const config = {
			mode: 'remote' as const,
			url: 'ws://127.0.0.1:18789',
			token: 'secret-token',
			tlsCaPath: '/tmp/ca.pem',
		};

		writeGatewayClientConfig(config, {HOME: home});

		expect(readGatewayClientConfig({HOME: home})).toEqual(config);
		if (process.platform !== 'win32') {
			const mode =
				fs.statSync(resolveGatewayClientConfigPath({HOME: home})).mode & 0o777;
			expect(mode).toBe(0o600);
		}
	});

	it('rejects invalid remote config', () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-gw-client-'));
		const configPath = resolveGatewayClientConfigPath({HOME: home});
		fs.mkdirSync(path.dirname(configPath), {recursive: true});
		fs.writeFileSync(configPath, JSON.stringify({mode: 'remote', token: 't'}));

		expect(() => readGatewayClientConfig({HOME: home})).toThrow(
			/gateway client config/,
		);
	});
});
