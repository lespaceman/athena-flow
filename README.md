# athena-flow

Athena is a workflow runtime for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).
Today it runs on Claude Code hooks, orchestrates workflow and plugin execution, and provides an interactive terminal runtime for observability and control.
The harness architecture is expanding: Codex support will run through `codex-app-server`, with more harness integrations coming.

## Install

```bash
npm install -g athena-flow-cli
```

Requires Node.js >= 20.

## Quick Start

```bash
# Launch in your project directory
athena

# Or use the full command name
athena-flow
```

On first run, a setup wizard guides theme selection, harness configuration, and optional workflow activation.

## Usage

```bash
athena-flow                             # Start in current project directory
athena-flow --project-dir=/my/project   # Specify project directory
athena-flow setup                       # Re-run setup wizard
athena-flow sessions                    # Pick a session interactively
athena-flow resume                      # Resume most recent session
athena-flow resume <sessionId>          # Resume specific session
```

## What Athena Does

Athena runs as a workflow runtime around Claude Code execution:

1. Registers Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) to forward runtime events.
2. Receives event streams over Unix Domain Sockets using NDJSON.
3. Applies workflow, plugin, and isolation policy.
4. Persists session state and renders live runtime state in the terminal.

```
Claude Code -> hook-forwarder (stdin) -> UDS -> athena-flow runtime
```

## Harness Support

- `claude-code` (current): integrated via Claude Code hooks and forwarded runtime events.
- `codex` (planned): integration path is `codex-app-server`.
- Additional harness support is in progress.

## CLI Options

| Flag            | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `--project-dir` | Project directory for hook socket (default: cwd)              |
| `--plugin`      | Path to a Claude Code plugin directory (repeatable)           |
| `--isolation`   | Isolation preset: `strict` (default), `minimal`, `permissive` |
| `--theme`       | Color theme: `dark` (default), `light`, `high-contrast`       |
| `--ascii`       | Use ASCII-only UI glyphs for compatibility                    |
| `--workflow`    | Workflow reference (for example `name@owner/repo`)            |
| `--verbose`     | Show additional rendering detail                              |

## CLI Commands

| Command              | Description                                   |
| -------------------- | --------------------------------------------- |
| `setup`              | Re-run setup wizard                           |
| `sessions`           | Launch interactive session picker             |
| `resume [sessionId]` | Resume most recent session, or a specific one |

## Features

- Live event feed for tools, permissions, results, and errors
- Session persistence in SQLite with resume support
- Plugin system for commands, hooks, MCP servers, and agents
- Workflow orchestration with prompt templates, loops, and plugin bundles
- Isolation presets (`strict`, `minimal`, `permissive`)
- Keyboard-driven terminal runtime with theme support

## Configuration

Config files are merged in order: global -> project -> CLI flags.

```text
~/.config/athena/config.json          # Global config
{projectDir}/.athena/config.json      # Project config
```

```json
{
	"plugins": ["/path/to/plugin"],
	"additionalDirectories": ["/path/to/allow"],
	"workflow": "e2e-test-builder"
}
```

## Workflow Marketplace Resolution

- Workflow refs (`name@owner/repo`) are resolved from `.athena-workflow/marketplace.json` (preferred).
- Legacy workflow manifests at `.claude-plugin/marketplace.json` are still supported as fallback.
- Workflow `plugins[]` should use marketplace refs.

## Development

```bash
npm install
npm run build
npm run typecheck
npm run dev
npm test
npm run lint
```

Performance profiling artifacts are written to `.profiles/` via:

```bash
npm run perf:tui -- -- sessions
```

See `docs/performance-profiling.md` for profiling modes and artifact analysis.

## License

MIT
