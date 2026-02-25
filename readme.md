# athena-flow

Terminal companion UI for [Claude Code](https://claude.ai/code) — intercepts hook events via Unix Domain Sockets and renders a rich, interactive dashboard.

Built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs) + React 19.

## Install

```bash
npm install -g athena-flow
```

Requires Node.js >= 18.

## Usage

```bash
athena-cli                              # Start in current project directory
athena-cli --project-dir=/my/project    # Specify project directory
athena-cli --continue                   # Resume most recent session
athena-cli --sessions                   # Pick a session interactively
```

### Options

| Flag            | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `--project-dir` | Project directory for hook socket (default: cwd)              |
| `--plugin`      | Path to a Claude Code plugin directory (repeatable)           |
| `--isolation`   | Isolation preset: `strict` (default), `minimal`, `permissive` |
| `--theme`       | Color theme: `dark` (default), `light`, `high-contrast`       |
| `--workflow`    | Workflow reference (e.g. `name@rev`)                          |
| `--continue`    | Resume most recent session, or specify a session ID           |
| `--sessions`    | Launch interactive session picker                             |
| `--verbose`     | Show additional rendering detail                              |

### Configuration

Config files are merged in order: global → project → CLI flags.

```
~/.config/athena/config.json          # Global config
{projectDir}/.athena/config.json      # Project config
```

```json
{
	"plugins": ["/path/to/plugin"],
	"additionalDirectories": ["/path/to/allow"]
}
```

## Development

```bash
npm install
npm run build       # Bundle with tsup
npm run typecheck   # Type-check with tsc (no emit)
npm run dev         # Watch mode (tsup --watch)
npm start           # Build & run
npm test            # Run vitest tests
npm run lint        # Prettier + ESLint
npm run format      # Auto-format
```

## Architecture

Two entry points:

- **`athena-cli`** — Main Ink terminal UI. Parses args, renders React app, creates UDS server to receive hook events.
- **`athena-hook-forwarder`** — Lightweight script invoked by Claude Code hooks. Reads JSON from stdin, forwards to the UI via Unix Domain Socket, returns results via stdout.

```
Claude Code → hook-forwarder (stdin) → UDS → athena-cli → Dashboard UI
```

## License

MIT
