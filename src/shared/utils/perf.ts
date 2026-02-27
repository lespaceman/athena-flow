import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {monitorEventLoopDelay, performance} from 'node:perf_hooks';

type PerfScalar = string | number | boolean | null;
type PerfFields = Record<string, PerfScalar | undefined>;
type StopMeasure = () => void;

type InkKeyLike = {
	upArrow?: boolean;
	downArrow?: boolean;
	leftArrow?: boolean;
	rightArrow?: boolean;
	return?: boolean;
	escape?: boolean;
	tab?: boolean;
	home?: boolean;
	end?: boolean;
	pageUp?: boolean;
	pageDown?: boolean;
	delete?: boolean;
	backspace?: boolean;
	ctrl?: boolean;
	meta?: boolean;
	shift?: boolean;
};

const PERF_ENABLED = process.env['ATHENA_PROFILE'] === '1';
const LOG_ALL_INPUT = process.env['ATHENA_PROFILE_INPUT_ALL'] === '1';
const DEFAULT_SLOW_MS = readNumberEnv('ATHENA_PROFILE_SLOW_MS', 8);
const INPUT_SLOW_MS = readNumberEnv('ATHENA_PROFILE_INPUT_SLOW_MS', 4);
const LOOP_INTERVAL_MS = Math.max(
	200,
	Math.floor(readNumberEnv('ATHENA_PROFILE_LOOP_MS', 1000)),
);

const NOOP: StopMeasure = () => {};

let stream: fs.WriteStream | null = null;
let streamPath: string | null = null;
let streamInitFailed = false;
let startupWritten = false;

function readNumberEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMs(value: number): number {
	return Number(value.toFixed(3));
}

function nsToMs(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 0;
	return value / 1_000_000;
}

function defaultLogPath(): string {
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	return path.join(process.cwd(), '.profiles', `athena-perf-${stamp}.ndjson`);
}

function ensureStream(): fs.WriteStream | null {
	if (!PERF_ENABLED || streamInitFailed) return null;
	if (stream) return stream;

	try {
		const configured = process.env['ATHENA_PROFILE_LOG'];
		const target = path.resolve(configured ?? defaultLogPath());
		fs.mkdirSync(path.dirname(target), {recursive: true});
		stream = fs.createWriteStream(target, {flags: 'a'});
		streamPath = target;
		stream.on('error', () => {
			streamInitFailed = true;
		});
	} catch {
		streamInitFailed = true;
		return null;
	}

	return stream;
}

function writeEvent(type: string, fields: PerfFields = {}): void {
	if (!PERF_ENABLED) return;
	const writer = ensureStream();
	if (!writer) return;

	if (!startupWritten) {
		startupWritten = true;
		writeEvent('profile.start', {
			pid: process.pid,
			node: process.version,
			log_path: streamPath ?? undefined,
		});
	}

	const payload: Record<string, unknown> = {
		type,
		ts: Date.now(),
		iso: new Date().toISOString(),
	};
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) payload[key] = value;
	}

	writer.write(`${JSON.stringify(payload)}\n`);
}

function renderInputChar(input: string): string {
	if (input === ' ') return 'Space';
	if (!input) return '';
	if (/^[\x20-\x7E]+$/.test(input)) return input;
	return [...input]
		.map(ch => `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}`)
		.join('+');
}

export function describeInkKey(input: string, key: InkKeyLike): string {
	if (key.ctrl && input) return `Ctrl+${renderInputChar(input)}`;
	if (key.meta && input) return `Meta+${renderInputChar(input)}`;
	if (key.shift && input) return `Shift+${renderInputChar(input)}`;
	if (key.upArrow) return 'ArrowUp';
	if (key.downArrow) return 'ArrowDown';
	if (key.leftArrow) return 'ArrowLeft';
	if (key.rightArrow) return 'ArrowRight';
	if (key.pageUp) return 'PageUp';
	if (key.pageDown) return 'PageDown';
	if (key.home) return 'Home';
	if (key.end) return 'End';
	if (key.escape) return 'Escape';
	if (key.tab) return 'Tab';
	if (key.return) return 'Enter';
	if (key.delete) return 'Delete';
	if (key.backspace) return 'Backspace';
	return renderInputChar(input) || 'Unknown';
}

export function isPerfEnabled(): boolean {
	return PERF_ENABLED;
}

export function getPerfLogPath(): string | null {
	if (!PERF_ENABLED) return null;
	ensureStream();
	return streamPath;
}

export function logPerfEvent(type: string, fields: PerfFields = {}): void {
	writeEvent(type, fields);
}

export function startPerfMeasure(
	name: string,
	fields: PerfFields = {},
	thresholdMs = DEFAULT_SLOW_MS,
): StopMeasure {
	if (!PERF_ENABLED) return NOOP;
	const startedAt = performance.now();
	return () => {
		const durationMs = performance.now() - startedAt;
		if (durationMs < thresholdMs) return;
		writeEvent('slow.op', {
			name,
			duration_ms: roundMs(durationMs),
			threshold_ms: thresholdMs,
			...fields,
		});
	};
}

export function startInputMeasure(
	scope: string,
	input: string,
	key: InkKeyLike,
): StopMeasure {
	if (!PERF_ENABLED) return NOOP;
	const label = describeInkKey(input, key);
	const startedAt = performance.now();
	return () => {
		const durationMs = performance.now() - startedAt;
		if (!LOG_ALL_INPUT && durationMs < INPUT_SLOW_MS) return;
		writeEvent('input.handler', {
			scope,
			key: label,
			duration_ms: roundMs(durationMs),
			slow: durationMs >= INPUT_SLOW_MS,
		});
	};
}

export function logReactCommit(
	id: string,
	phase: string,
	actualDuration: number,
	baseDuration: number,
	startTime: number,
	commitTime: number,
): void {
	if (!PERF_ENABLED) return;
	writeEvent('react.commit', {
		id,
		phase,
		actual_ms: roundMs(actualDuration),
		base_ms: roundMs(baseDuration),
		start_ms: roundMs(startTime),
		commit_ms: roundMs(commitTime),
	});
}

export function startEventLoopMonitor(scope = 'app'): StopMeasure {
	if (!PERF_ENABLED) return NOOP;

	const histogram = monitorEventLoopDelay({resolution: 20});
	histogram.enable();

	writeEvent('event_loop.start', {
		scope,
		interval_ms: LOOP_INTERVAL_MS,
		log_path: getPerfLogPath() ?? undefined,
	});

	const timer = setInterval(() => {
		writeEvent('event_loop.sample', {
			scope,
			min_ms: roundMs(nsToMs(histogram.min)),
			mean_ms: roundMs(nsToMs(histogram.mean)),
			p50_ms: roundMs(nsToMs(histogram.percentile(50))),
			p95_ms: roundMs(nsToMs(histogram.percentile(95))),
			p99_ms: roundMs(nsToMs(histogram.percentile(99))),
			max_ms: roundMs(nsToMs(histogram.max)),
		});
		histogram.reset();
	}, LOOP_INTERVAL_MS);
	timer.unref();

	return () => {
		clearInterval(timer);
		histogram.disable();
		writeEvent('event_loop.stop', {scope});
	};
}
