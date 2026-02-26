# Performance Profiling (TUI)

This repo includes built-in profiling tooling for the Ink TUI.

## Quick Start

```bash
# Full capture: CPU profile + Node trace events + app-level perf log
npm run perf:tui -- -- --sessions
```

Then reproduce the lag (for example: hold arrow-down in session picker, then type quickly in input) for 20-60 seconds and exit with `Ctrl+C`.

Artifacts are written to `.profiles/`:

- `athena-*.cpuprofile` (Node CPU profile)
- `node-trace-*.json` (trace events)
- `tui-perf-*.ndjson` (app instrumentation: slow input handlers, React commits, event-loop delay)

## Focused Modes

```bash
# CPU only
npm run perf:cpu -- -- --sessions

# Trace only
npm run perf:trace -- -- --sessions

# Heap only (memory profiling)
npm run perf:heap -- -- --sessions
```

## App Instrumentation Controls

`perf:tui` enables `ATHENA_PROFILE=1` automatically.

Optional env vars:

- `ATHENA_PROFILE_SLOW_MS` (default `8`) slow-operation threshold
- `ATHENA_PROFILE_INPUT_SLOW_MS` (default `4`) slow-input threshold
- `ATHENA_PROFILE_INPUT_ALL=1` log every input handler (high volume)
- `ATHENA_PROFILE_LOOP_MS` (default `1000`) event-loop sample interval
- `ATHENA_PROFILE_LOG=/path/file.ndjson` custom log path

Example with full input trace:

```bash
ATHENA_PROFILE_INPUT_ALL=1 npm run perf:tui -- -- --sessions
```

## Inspecting Results

1. CPU profile: open `*.cpuprofile` in Chrome DevTools (`Performance` panel -> Load profile).
2. Trace events: open `node-trace-*.json` in Chrome tracing viewers.
3. App log: inspect top slow paths:

```bash
rg '"type":"(slow.op|input.handler|react.commit|event_loop.sample)"' .profiles/tui-perf-*.ndjson
```
