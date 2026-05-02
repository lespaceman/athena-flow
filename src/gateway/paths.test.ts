import {describe, expect, it} from 'vitest';
import {resolveGatewayPaths, resolveListenSpec} from './paths';

describe('resolveGatewayPaths', () => {
	it('uses XDG_RUNTIME_DIR when set', () => {
		const p = resolveGatewayPaths({
			HOME: '/u/test',
			XDG_RUNTIME_DIR: '/run/user/1000',
		});
		expect(p.runDir).toBe('/run/user/1000/athena');
		expect(p.socketPath).toBe('/run/user/1000/athena/gateway.sock');
		expect(p.lockPath).toBe('/run/user/1000/athena/gateway.lock');
		expect(p.configDir).toBe('/u/test/.config/athena/gateway');
		expect(p.tokenPath).toBe('/u/test/.config/athena/gateway/token');
	});

	it('falls back to ~/.config/athena/run when XDG is unset', () => {
		const p = resolveGatewayPaths({HOME: '/u/test'});
		expect(p.runDir).toBe('/u/test/.config/athena/run');
		expect(p.socketPath).toBe('/u/test/.config/athena/run/gateway.sock');
	});

	it('rejects an excessively long socket path', () => {
		const longHome = '/u/' + 'x'.repeat(200);
		expect(() => resolveGatewayPaths({HOME: longHome})).toThrow(
			/sun_path limit/,
		);
	});

	it('treats empty XDG_RUNTIME_DIR as unset', () => {
		const p = resolveGatewayPaths({HOME: '/u/test', XDG_RUNTIME_DIR: '   '});
		expect(p.runDir).toBe('/u/test/.config/athena/run');
	});
});

describe('resolveListenSpec', () => {
	it('defaults to the UDS socket path', () => {
		const paths = resolveGatewayPaths({HOME: '/u/test'});

		expect(resolveListenSpec({paths})).toEqual({
			kind: 'uds',
			socketPath: paths.socketPath,
		});
	});

	it('parses loopback bind host and port', () => {
		const paths = resolveGatewayPaths({HOME: '/u/test'});

		expect(resolveListenSpec({paths, bind: '127.0.0.1:0'})).toEqual({
			kind: 'tcp',
			host: '127.0.0.1',
			port: 0,
			insecure: false,
		});
	});

	it('carries the insecure flag for non-loopback bind', () => {
		const paths = resolveGatewayPaths({HOME: '/u/test'});

		expect(
			resolveListenSpec({paths, bind: '0.0.0.0:18789', insecure: true}),
		).toEqual({
			kind: 'tcp',
			host: '0.0.0.0',
			port: 18789,
			insecure: true,
		});
	});
});
