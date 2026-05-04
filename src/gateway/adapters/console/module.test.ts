import {describe, expect, it} from 'vitest';
import {consoleModule} from './module';

describe('consoleModule.parseConfig', () => {
	it('accepts a minimal valid sidecar config (inline pairing token)', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/runner/r1/console/adapter',
				runner_id: 'runner_1',
				pairing_token: 'tok_abc',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config.brokerUrl).toBe(
			'wss://broker.example.com/runner/r1/console/adapter',
		);
		expect(result.config.runnerId).toBe('runner_1');
		expect(result.config.pairingToken).toBe('tok_abc');
	});

	it('accepts token_path in place of pairing_token', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/adapter',
				runner_id: 'runner_1',
				token_path: '/var/lib/athena/pairing.jwt',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(true);
	});

	it('accepts ws://127.0.0.1 for local development', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'ws://127.0.0.1:8787/adapter',
				runner_id: 'runner_1',
				pairing_token: 'tok',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(true);
	});

	it('rejects ws:// for non-loopback hosts', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'ws://broker.example.com/adapter',
				runner_id: 'runner_1',
				pairing_token: 'tok',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toMatch(/wss/);
	});

	it('rejects missing broker_url', () => {
		const result = consoleModule.parseConfig({
			options: {runner_id: 'r1', pairing_token: 'tok'},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toMatch(/broker_url/);
	});

	it('rejects missing runner_id', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/adapter',
				pairing_token: 'tok',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toMatch(/runner_id/);
	});

	it('rejects missing both pairing_token and token_path', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/adapter',
				runner_id: 'r1',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toMatch(/pairing_token|token_path/);
	});

	it('captures optional workspace_id and tls_ca_path', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/adapter',
				runner_id: 'r1',
				workspace_id: 'ws1',
				pairing_token: 'tok',
				tls_ca_path: '/etc/ssl/broker-ca.pem',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config.workspaceId).toBe('ws1');
		expect(result.config.tlsCaPath).toBe('/etc/ssl/broker-ca.pem');
	});

	it('accepts dashboard_config: true in place of pairing_token/token_path', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/adapter',
				runner_id: 'runner_1',
				dashboard_config: true,
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config.dashboardConfig).toBe(true);
		expect(result.config.pairingToken).toBeUndefined();
		expect(result.config.tokenPath).toBeUndefined();
	});

	it('rejects dashboard_config combined with pairing_token', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/adapter',
				runner_id: 'runner_1',
				dashboard_config: true,
				pairing_token: 'tok',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toMatch(/mutually exclusive/);
	});

	it('rejects dashboard_config combined with token_path', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/adapter',
				runner_id: 'runner_1',
				dashboard_config: true,
				token_path: '/etc/athena/pairing.jwt',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toMatch(/mutually exclusive/);
	});

	it('rejects non-boolean dashboard_config', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/adapter',
				runner_id: 'runner_1',
				dashboard_config: 'yes',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toMatch(/dashboard_config must be a boolean/);
	});

	it('error message mentions dashboard_config when no auth source is set', () => {
		const result = consoleModule.parseConfig({
			options: {
				broker_url: 'wss://broker.example.com/adapter',
				runner_id: 'runner_1',
			},
			allowedUserIds: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toMatch(/dashboard_config/);
	});

	it('module name is "console"', () => {
		expect(consoleModule.name).toBe('console');
	});
});
