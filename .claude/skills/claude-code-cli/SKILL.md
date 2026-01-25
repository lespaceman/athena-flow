---
name: claude-code-cli
description: Complete reference for Claude Code CLI commands, flags, and options. Use when looking up CLI syntax, flags, or command options.
user-invocable: false
---

# Claude Code CLI Reference

## CLI Commands

| Command | Description | Example |
|---------|-------------|---------|
| `claude` | Start interactive REPL | `claude` |
| `claude "query"` | Start REPL with initial prompt | `claude "explain this project"` |
| `claude -p "query"` | Query via SDK, then exit | `claude -p "explain this function"` |
| `cat file \| claude -p "query"` | Process piped content | `cat logs.txt \| claude -p "explain"` |
| `claude -c` | Continue most recent conversation | `claude -c` |
| `claude -c -p "query"` | Continue via SDK | `claude -c -p "Check for type errors"` |
| `claude -r "<session>" "query"` | Resume session by ID or name | `claude -r "auth-refactor" "Finish this PR"` |
| `claude update` | Update to latest version | `claude update` |
| `claude mcp` | Configure MCP servers | See MCP documentation |

## CLI Flags

### Core Flags

| Flag | Description |
|------|-------------|
| `--print`, `-p` | Print response without interactive mode |
| `--continue`, `-c` | Load most recent conversation |
| `--resume`, `-r` | Resume session by ID or name |
| `--version`, `-v` | Output version number |
| `--verbose` | Enable verbose logging |
| `--debug` | Enable debug mode with optional category filtering |

### Model & Session

| Flag | Description |
|------|-------------|
| `--model` | Set model: `sonnet`, `opus`, or full model name |
| `--fallback-model` | Fallback model when default is overloaded |
| `--session-id` | Use specific session ID (must be valid UUID) |
| `--fork-session` | Create new session ID when resuming |
| `--no-session-persistence` | Disable session persistence (print mode only) |

### Agent & Tool Control

| Flag | Description |
|------|-------------|
| `--agent` | Specify an agent for the current session |
| `--agents` | Define custom subagents via JSON |
| `--allowedTools` | Tools that execute without prompting |
| `--disallowedTools` | Tools removed from model's context |
| `--tools` | Restrict which built-in tools Claude can use |
| `--permission-mode` | Begin in specified permission mode |

### Output Control

| Flag | Description |
|------|-------------|
| `--output-format` | Output format: `text`, `json`, `stream-json` |
| `--json-schema` | Get validated JSON output matching schema |
| `--input-format` | Input format for print mode: `text`, `stream-json` |
| `--include-partial-messages` | Include partial streaming events |

### System Prompt

| Flag | Description |
|------|-------------|
| `--system-prompt` | Replace entire system prompt |
| `--system-prompt-file` | Load system prompt from file (print mode only) |
| `--append-system-prompt` | Append to default system prompt |
| `--append-system-prompt-file` | Append file contents to default prompt |

### Configuration

| Flag | Description |
|------|-------------|
| `--add-dir` | Add additional working directories |
| `--mcp-config` | Load MCP servers from JSON files |
| `--strict-mcp-config` | Only use MCP servers from `--mcp-config` |
| `--plugin-dir` | Load plugins from directories |
| `--settings` | Path to settings JSON file |
| `--setting-sources` | Setting sources to load: `user`, `project`, `local` |

### Limits & Budget

| Flag | Description |
|------|-------------|
| `--max-turns` | Limit agentic turns (print mode only) |
| `--max-budget-usd` | Maximum dollar amount for API calls |

### Special Modes

| Flag | Description |
|------|-------------|
| `--chrome` | Enable Chrome browser integration |
| `--no-chrome` | Disable Chrome browser integration |
| `--ide` | Auto-connect to IDE on startup |
| `--init` | Run Setup hooks and start interactive mode |
| `--init-only` | Run Setup hooks and exit |
| `--maintenance` | Run Setup hooks with maintenance trigger |
| `--disable-slash-commands` | Disable all skills and slash commands |

### Remote Sessions

| Flag | Description |
|------|-------------|
| `--remote` | Create new web session on claude.ai |
| `--teleport` | Resume web session in local terminal |

### Advanced

| Flag | Description |
|------|-------------|
| `--dangerously-skip-permissions` | Skip all permission prompts |
| `--allow-dangerously-skip-permissions` | Enable bypass as an option |
| `--permission-prompt-tool` | MCP tool to handle permission prompts |
| `--betas` | Beta headers for API requests |

## Agents Flag Format

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Expert code reviewer. Use proactively after code changes.",
    "prompt": "You are a senior code reviewer.",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "sonnet"
  }
}'
```

| Field | Required | Description |
|-------|----------|-------------|
| `description` | Yes | When the subagent should be invoked |
| `prompt` | Yes | System prompt for the subagent |
| `tools` | No | Array of specific tools (inherits all if omitted) |
| `model` | No | Model alias: `sonnet`, `opus`, `haiku`, `inherit` |

## System Prompt Flags Comparison

| Flag | Behavior | Modes |
|------|----------|-------|
| `--system-prompt` | Replaces entire default prompt | Interactive + Print |
| `--system-prompt-file` | Replaces with file contents | Print only |
| `--append-system-prompt` | Appends to default prompt | Interactive + Print |
| `--append-system-prompt-file` | Appends file contents | Print only |

## Permission Rule Syntax

The `--allowedTools` flag uses permission rule syntax:

```bash
# Allow specific tools
--allowedTools "Bash,Read,Edit"

# Allow with prefix matching (`:*` suffix)
--allowedTools "Bash(git diff:*)" "Bash(git log:*)"

# This allows any command starting with "git diff"
```

## Examples

### Structured JSON Output

```bash
claude -p "Summarize this project" --output-format json
```

### With JSON Schema

```bash
claude -p "Extract function names" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}}}'
```

### Auto-Approve Tools

```bash
claude -p "Run tests and fix failures" \
  --allowedTools "Bash,Read,Edit"
```

### Continue Conversation

```bash
# Continue most recent
claude -p "Now focus on database queries" --continue

# Resume specific session
claude -p "Continue review" --resume "auth-refactor"
```

### Custom System Prompt

```bash
# Replace entirely
claude --system-prompt "You are a Python expert"

# Append to default
claude --append-system-prompt "Always use TypeScript"
```

### Restrict Tools

```bash
# Only allow specific tools
claude --tools "Bash,Edit,Read"

# Disable all tools
claude --tools ""
```
