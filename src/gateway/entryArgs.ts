export type GatewayDaemonArgs = {
	silent: boolean;
	bind?: string;
	insecure: boolean;
	gracePeriodMs?: number;
	tlsCertPath?: string;
	tlsKeyPath?: string;
};

export function parseGatewayDaemonArgs(argv: string[]): GatewayDaemonArgs {
	const parsed: GatewayDaemonArgs = {silent: false, insecure: false};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i]!;
		if (arg === '--silent') {
			parsed.silent = true;
			continue;
		}
		if (arg === '--insecure') {
			parsed.insecure = true;
			continue;
		}
		if (arg === '--bind') {
			parsed.bind = requireValue(argv, i, '--bind');
			i += 1;
			continue;
		}
		if (arg.startsWith('--bind=')) {
			parsed.bind = arg.slice('--bind='.length);
			continue;
		}
		if (arg === '--grace-period-ms') {
			parsed.gracePeriodMs = parseGracePeriod(
				requireValue(argv, i, '--grace-period-ms'),
			);
			i += 1;
			continue;
		}
		if (arg.startsWith('--grace-period-ms=')) {
			parsed.gracePeriodMs = parseGracePeriod(
				arg.slice('--grace-period-ms='.length),
			);
			continue;
		}
		const tls = matchPathFlag(arg, argv, i, [
			['--tls-cert', 'tlsCertPath'],
			['--tls-key', 'tlsKeyPath'],
		]);
		if (tls) {
			parsed[tls.key] = tls.value;
			i += tls.consumed;
			continue;
		}
		throw new Error(`gateway: unknown daemon option ${arg}`);
	}
	if (
		(parsed.tlsCertPath && !parsed.tlsKeyPath) ||
		(!parsed.tlsCertPath && parsed.tlsKeyPath)
	) {
		throw new Error('gateway: --tls-cert and --tls-key must be used together');
	}
	return parsed;
}

type TlsFlagKey = 'tlsCertPath' | 'tlsKeyPath';

function matchPathFlag(
	arg: string,
	argv: string[],
	index: number,
	specs: ReadonlyArray<readonly [string, TlsFlagKey]>,
): {key: TlsFlagKey; value: string; consumed: number} | null {
	for (const [flag, key] of specs) {
		if (arg === flag) {
			return {key, value: requireValue(argv, index, flag), consumed: 1};
		}
		const prefix = `${flag}=`;
		if (arg.startsWith(prefix)) {
			return {key, value: arg.slice(prefix.length), consumed: 0};
		}
	}
	return null;
}

function requireValue(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1];
	if (!value || value.startsWith('--')) {
		throw new Error(`gateway: ${flag} requires a value`);
	}
	return value;
}

function parseGracePeriod(value: string): number {
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0) {
		throw new Error(
			`gateway: --grace-period-ms must be a non-negative integer`,
		);
	}
	return n;
}
