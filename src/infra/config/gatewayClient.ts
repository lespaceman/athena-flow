import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	parseRuntimeEndpoint,
	type RuntimeEndpoint,
} from '../../shared/gateway-protocol';

export function resolveGatewayClientConfigPath(
	env: NodeJS.ProcessEnv = process.env,
): string {
	const home = env['HOME'] ?? os.homedir();
	return path.join(home, '.config', 'athena', 'gateway.json');
}

export function readGatewayClientConfig(
	env: NodeJS.ProcessEnv = process.env,
): RuntimeEndpoint {
	const configPath = resolveGatewayClientConfigPath(env);
	if (!fs.existsSync(configPath)) {
		return {mode: 'local'};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
	} catch (err) {
		throw new Error(
			`gateway client config ${configPath} is invalid JSON: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}
	try {
		return parseRuntimeEndpoint(parsed);
	} catch (err) {
		throw new Error(
			`gateway client config ${configPath} is invalid: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}
}

export function writeGatewayClientConfig(
	config: RuntimeEndpoint,
	env: NodeJS.ProcessEnv = process.env,
): void {
	const parsed = parseRuntimeEndpoint(config);
	const configPath = resolveGatewayClientConfigPath(env);
	const dir = path.dirname(configPath);
	fs.mkdirSync(dir, {recursive: true, mode: 0o700});
	fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2) + '\n', {
		encoding: 'utf-8',
		mode: 0o600,
	});
	if (process.platform !== 'win32') {
		try {
			fs.chmodSync(dir, 0o700);
			fs.chmodSync(configPath, 0o600);
		} catch {
			// best-effort
		}
	}
}
