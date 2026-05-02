import {describe, expect, it} from 'vitest';
import {resolveGatewayPaths} from './paths';

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
