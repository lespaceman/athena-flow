export type ExecJsonlEvent = {
	type: string;
	ts: number;
	data: unknown;
};

export function createExecJsonlEvent(
	type: string,
	data: unknown,
	ts = Date.now(),
): ExecJsonlEvent {
	return {type, ts, data};
}

export function toJsonlLine(event: ExecJsonlEvent): string {
	return `${JSON.stringify(event)}\n`;
}
