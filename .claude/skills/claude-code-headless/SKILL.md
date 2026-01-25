---
name: claude-code-headless
description: Reference documentation for running Claude Code programmatically via CLI and the Agent SDK. Use when implementing headless/programmatic Claude Code integration, CI/CD pipelines, or automated workflows.
user-invocable: false
---

# Run Claude Code Programmatically

Use the Agent SDK to run Claude Code programmatically from the CLI, Python, or TypeScript.

The Agent SDK gives you the same tools, agent loop, and context management that power Claude Code. It's available as a CLI for scripts and CI/CD, or as Python and TypeScript packages for full programmatic control.

> **Note:** The CLI was previously called "headless mode." The `-p` flag and all CLI options work the same way.

To run Claude Code programmatically from the CLI, pass `-p` with your prompt and any CLI options:

```bash
claude -p "Find and fix the bug in auth.py" --allowedTools "Read,Edit,Bash"
```

## Basic Usage

Add the `-p` (or `--print`) flag to any `claude` command to run it non-interactively. All CLI options work with `-p`, including:

* `--continue` for continuing conversations
* `--allowedTools` for auto-approving tools
* `--output-format` for structured output

Example asking Claude a question about your codebase:

```bash
claude -p "What does the auth module do?"
```

## Examples

### Get Structured Output

Use `--output-format` to control how responses are returned:

* `text` (default): plain text output
* `json`: structured JSON with result, session ID, and metadata
* `stream-json`: newline-delimited JSON for real-time streaming

This example returns a project summary as JSON with session metadata:

```bash
claude -p "Summarize this project" --output-format json
```

To get output conforming to a specific schema, use `--output-format json` with `--json-schema`:

```bash
claude -p "Extract the main function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}'
```

Use jq to parse the response and extract specific fields:

```bash
# Extract the text result
claude -p "Summarize this project" --output-format json | jq -r '.result'

# Extract structured output
claude -p "Extract function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}' \
  | jq '.structured_output'
```

### Auto-Approve Tools

Use `--allowedTools` to let Claude use certain tools without prompting:

```bash
claude -p "Run the test suite and fix any failures" \
  --allowedTools "Bash,Read,Edit"
```

### Create a Commit

Review staged changes and create a commit:

```bash
claude -p "Look at my staged changes and create an appropriate commit" \
  --allowedTools "Bash(git diff:*),Bash(git log:*),Bash(git status:*),Bash(git commit:*)"
```

The `--allowedTools` flag uses permission rule syntax. The `:*` suffix enables prefix matching, so `Bash(git diff:*)` allows any command starting with `git diff`.

### Customize the System Prompt

Use `--append-system-prompt` to add instructions while keeping Claude Code's default behavior:

```bash
gh pr diff "$1" | claude -p \
  --append-system-prompt "You are a security engineer. Review for vulnerabilities." \
  --output-format json
```

### Continue Conversations

Use `--continue` to continue the most recent conversation, or `--resume` with a session ID:

```bash
# First request
claude -p "Review this codebase for performance issues"

# Continue the most recent conversation
claude -p "Now focus on the database queries" --continue
claude -p "Generate a summary of all issues found" --continue
```

If you're running multiple conversations, capture the session ID:

```bash
session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$session_id"
```

## System Prompt Flags

| Flag | Behavior | Modes | Use Case |
|------|----------|-------|----------|
| `--system-prompt` | Replaces entire default prompt | Interactive + Print | Complete control over Claude's behavior |
| `--system-prompt-file` | Replaces with file contents | Print only | Load prompts from files |
| `--append-system-prompt` | Appends to default prompt | Interactive + Print | Add instructions while keeping defaults |
| `--append-system-prompt-file` | Appends file contents | Print only | Load additional instructions from files |

## Key CLI Flags for Programmatic Use

| Flag | Description |
|------|-------------|
| `-p, --print` | Print response without interactive mode |
| `--output-format` | Output format: `text`, `json`, `stream-json` |
| `--json-schema` | Get validated JSON output matching schema |
| `--allowedTools` | Tools that execute without prompting |
| `--continue, -c` | Continue most recent conversation |
| `--resume, -r` | Resume specific session by ID |
| `--max-turns` | Limit agentic turns (print mode only) |
| `--max-budget-usd` | Maximum dollar amount for API calls |
| `--no-session-persistence` | Disable session persistence |
| `--fallback-model` | Fallback model when default is overloaded |
