# athena-flow

Terminal companion UI for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — intercepts hook events via Unix Domain Sockets and renders a rich, interactive dashboard.

## Install

```bash
npm install -g athena-flow-cli
```

Requires Node.js >= 20.

## Quick Start

```bash
# Launch in your project directory
athena

# Or use the full name
athena-flow
```

On first run, a setup wizard walks you through theme selection, harness configuration, and optional workflow activation.

## How It Works

athena-flow acts as a companion process alongside Claude Code. It:

1. Registers Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) that forward events to the athena-flow process
2. Receives hook events over a Unix Domain Socket (NDJSON protocol)
3. Renders a live terminal dashboard with tool calls, permissions, subagent activity, and more

```
Claude Code → hook-forwarder (stdin) → UDS → athena-flow dashboard
```

## CLI Options

```
Usage
  $ athena-flow

Options
  --project-dir   Project directory for hook socket (default: cwd)
  --plugin        Path to a Claude Code plugin directory (repeatable)
  --isolation     Isolation preset: strict (default), minimal, permissive
  --verbose       Show additional rendering detail
  --theme         Color theme: dark (default), light, or high-contrast
  --continue      Resume the most recent session (or specify a session ID)
  --sessions      Launch interactive session picker
  --workflow      Workflow reference (e.g. name@owner/repo)

Examples
  $ athena-flow --project-dir=/my/project
  $ athena-flow --plugin=/path/to/my-plugin
  $ athena-flow --isolation=minimal
  $ athena-flow --continue
  $ athena-flow --sessions
```

## Features

- **Live event feed** — tool calls, results, permissions, and errors stream in real-time
- **Session persistence** — sessions are stored in SQLite; resume with `--continue`
- **Plugin system** — extend with custom commands, hooks, MCP servers, and agents
- **Workflow orchestration** — define reusable workflows with prompt templates, loop control, and plugin bundles
- **Isolation presets** — `strict`, `minimal`, or `permissive` control what Claude Code can access
- **Themes** — dark, light, and high-contrast terminal themes
- **Keyboard driven** — navigate, expand/collapse events, and interact entirely from the keyboard

## Configuration

Global config lives at `~/.config/athena/config.json`, project config at `{projectDir}/.athena/config.json`.

```json
{
  "plugins": ["/path/to/plugin"],
  "additionalDirectories": ["/path/to/allow"],
  "workflow": "my-workflow"
}
```

Plugin and workflow configs merge in order: global → project → CLI flags.

## Tech Stack

- [Ink](https://github.com/vadimdemedes/ink) + React 19 for terminal rendering
- [meow](https://github.com/sindresorhus/meow) for CLI argument parsing
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for session persistence
- TypeScript, ESM, vitest

## License

MIT
