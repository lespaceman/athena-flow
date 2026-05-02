import {describe, expect, it} from 'vitest';
import {parseGatewayDaemonArgs} from './entryArgs';

describe('parseGatewayDaemonArgs', () => {
	it('parses bind, insecure, silent, and grace period', () => {
		expect(
			parseGatewayDaemonArgs([
				'--silent',
				'--bind',
				'127.0.0.1:0',
				'--insecure',
				'--grace-period-ms=1000',
			]),
		).toEqual({
			silent: true,
			bind: '127.0.0.1:0',
			insecure: true,
			gracePeriodMs: 1000,
		});
	});

	it('rejects unknown options', () => {
		expect(() => parseGatewayDaemonArgs(['--wat'])).toThrow(/unknown/);
	});
});
