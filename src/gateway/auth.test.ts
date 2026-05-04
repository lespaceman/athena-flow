import {describe, expect, it} from 'vitest';
import {requireTokenForBind} from './auth';
import type {GatewayListenSpec} from './paths';

describe('requireTokenForBind', () => {
	it('allows UDS without a token', () => {
		const spec: GatewayListenSpec = {kind: 'uds', socketPath: '/tmp/gw.sock'};

		expect(() => requireTokenForBind(spec, '')).not.toThrow();
	});

	it('allows loopback TCP without insecure flag', () => {
		const spec: GatewayListenSpec = {
			kind: 'tcp',
			host: '127.0.0.1',
			port: 18789,
			insecure: false,
		};

		expect(() => requireTokenForBind(spec, 'secret-token-1234')).not.toThrow();
	});

	it('refuses non-loopback TCP without token', () => {
		const spec: GatewayListenSpec = {
			kind: 'tcp',
			host: '0.0.0.0',
			port: 18789,
			insecure: true,
		};

		expect(() => requireTokenForBind(spec, '')).toThrow(/without token/);
	});

	it('refuses non-loopback plain WS without --insecure', () => {
		const spec: GatewayListenSpec = {
			kind: 'tcp',
			host: '0.0.0.0',
			port: 18789,
			insecure: false,
		};

		expect(() => requireTokenForBind(spec, 'secret-token-1234')).toThrow(
			/--insecure/,
		);
	});

	it('allows non-loopback bind with TLS configured even without --insecure', () => {
		const spec: GatewayListenSpec = {
			kind: 'tcp',
			host: '0.0.0.0',
			port: 18789,
			insecure: false,
			tls: {certPath: '/etc/ssl/gw.crt', keyPath: '/etc/ssl/gw.key'},
		};

		expect(() => requireTokenForBind(spec, 'secret-token-1234')).not.toThrow();
	});
});
