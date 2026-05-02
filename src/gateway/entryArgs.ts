export type GatewayDaemonArgs = {
	silent: boolean;
	bind?: string;
	insecure: boolean;
	gracePeriodMs?: number;
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
		throw new Error(`gateway: unknown daemon option ${arg}`);
	}
	return parsed;
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
