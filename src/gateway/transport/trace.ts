import fs from 'node:fs';

export type GatewayTraceDirection = 'in' | 'out';

export function traceGatewayFrame(
	transport: string,
	peer: string,
	direction: GatewayTraceDirection,
	frame: unknown,
): void {
	if (process.env['ATHENA_GATEWAY_TRACE'] !== '1') return;
	writeGatewayTrace(
		`${transport} ${direction} ${peer} ${JSON.stringify(redactFrame(frame))}`,
	);
}

export function writeGatewayTrace(message: string): void {
	if (process.env['ATHENA_GATEWAY_TRACE'] !== '1') return;
	const line = `athena-gateway: [trace] ${message}\n`;
	const traceFile = process.env['ATHENA_GATEWAY_TRACE_FILE'];
	if (traceFile && traceFile.length > 0) {
		try {
			fs.appendFileSync(traceFile, line, 'utf-8');
			return;
		} catch {
			// fall through to stderr
		}
	}
	process.stderr.write(line);
}

function redactFrame(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redactFrame);
	if (typeof value !== 'object' || value === null) return value;
	const out: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (key === 'token') {
			out[key] = '<redacted>';
			continue;
		}
		out[key] = redactFrame(child);
	}
	return out;
}
