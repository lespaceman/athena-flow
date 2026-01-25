---
name: claude-code-mcp
description: Reference documentation for connecting Claude Code to external tools via Model Context Protocol (MCP). Use when configuring MCP servers, implementing MCP integrations, or understanding MCP transports.
user-invocable: false
---

# Connect Claude Code to Tools via MCP

Claude Code can connect to external tools and data sources through the Model Context Protocol (MCP), an open source standard for AI-tool integrations.

## Installing MCP Servers

### Option 1: Add a Remote HTTP Server (Recommended)

```bash
# Basic syntax
claude mcp add --transport http <name> <url>

# Example: Connect to Notion
claude mcp add --transport http notion https://mcp.notion.com/mcp

# With Bearer token
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"
```

### Option 2: Add a Remote SSE Server (Deprecated)

```bash
claude mcp add --transport sse <name> <url>

# Example: Connect to Asana
claude mcp add --transport sse asana https://mcp.asana.com/sse
```

### Option 3: Add a Local stdio Server

```bash
# Basic syntax
claude mcp add [options] <name> -- <command> [args...]

# Example: Add Airtable server
claude mcp add --transport stdio --env AIRTABLE_API_KEY=YOUR_KEY airtable \
  -- npx -y airtable-mcp-server
```

> **Important:** All options (`--transport`, `--env`, `--scope`, `--header`) must come **before** the server name. The `--` separates the server name from the command.

### Managing Servers

```bash
# List all configured servers
claude mcp list

# Get details for a specific server
claude mcp get github

# Remove a server
claude mcp remove github

# Check server status (within Claude Code)
/mcp
```

## MCP Installation Scopes

| Scope | Storage | Availability |
|-------|---------|--------------|
| `local` (default) | `~/.claude.json` under project path | Current project only |
| `project` | `.mcp.json` in project root | Shared with team (version controlled) |
| `user` | `~/.claude.json` | All your projects |

```bash
# Add a project-scoped server (shared with team)
claude mcp add --transport http paypal --scope project https://mcp.paypal.com/mcp

# Add a user-scoped server (all your projects)
claude mcp add --transport http hubspot --scope user https://mcp.hubspot.com/anthropic
```

## Environment Variable Expansion in .mcp.json

```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

Syntax:
* `${VAR}` - Expands to value of VAR
* `${VAR:-default}` - Uses default if VAR not set

## Authentication with OAuth 2.0

1. Add the server:
```bash
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
```

2. Authenticate within Claude Code:
```
> /mcp
```
Then follow browser steps to login.

## Add MCP Server from JSON

```bash
# HTTP server
claude mcp add-json weather-api '{"type":"http","url":"https://api.weather.com/mcp","headers":{"Authorization":"Bearer token"}}'

# stdio server
claude mcp add-json local-weather '{"type":"stdio","command":"/path/to/weather-cli","args":["--api-key","abc123"]}'
```

## Import from Claude Desktop

```bash
claude mcp add-from-claude-desktop
```

## Use Claude Code as MCP Server

```bash
claude mcp serve
```

Claude Desktop configuration:
```json
{
  "mcpServers": {
    "claude-code": {
      "type": "stdio",
      "command": "claude",
      "args": ["mcp", "serve"],
      "env": {}
    }
  }
}
```

## MCP Resources with @ Mentions

Reference MCP resources using `@server:protocol://resource/path`:

```
> Can you analyze @github:issue://123 and suggest a fix?
> Compare @postgres:schema://users with @docs:file://database/user-model
```

## MCP Prompts as Commands

```
> /mcp__github__list_prs
> /mcp__github__pr_review 456
> /mcp__jira__create_issue "Bug in login flow" high
```

## MCP Tool Search

When many MCP tools are configured, Tool Search activates automatically to load tools on-demand.

Control with `ENABLE_TOOL_SEARCH` environment variable:

| Value | Behavior |
|-------|----------|
| `auto` | Activates when MCP tools exceed 10% of context (default) |
| `auto:<N>` | Custom threshold (e.g., `auto:5` for 5%) |
| `true` | Always enabled |
| `false` | Disabled, all tools loaded upfront |

## Plugin-Provided MCP Servers

Define in `.mcp.json` at plugin root:

```json
{
  "database-tools": {
    "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
    "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
    "env": {
      "DB_URL": "${DB_URL}"
    }
  }
}
```

## Managed MCP Configuration (Enterprise)

System administrators deploy to:
* macOS: `/Library/Application Support/ClaudeCode/managed-mcp.json`
* Linux/WSL: `/etc/claude-code/managed-mcp.json`
* Windows: `C:\Program Files\ClaudeCode\managed-mcp.json`

Policy-based control in managed settings:

```json
{
  "allowedMcpServers": [
    { "serverName": "github" },
    { "serverCommand": ["npx", "-y", "@modelcontextprotocol/server-filesystem"] },
    { "serverUrl": "https://mcp.company.com/*" }
  ],
  "deniedMcpServers": [
    { "serverName": "dangerous-server" },
    { "serverUrl": "https://*.untrusted.com/*" }
  ]
}
```

## MCP Output Limits

Default maximum: 25,000 tokens. Adjust with:

```bash
export MAX_MCP_OUTPUT_TOKENS=50000
claude
```

## Practical Examples

### Monitor Errors with Sentry

```bash
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
> /mcp  # Authenticate
> "What are the most common errors in the last 24 hours?"
```

### Connect to GitHub

```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
> /mcp  # Authenticate
> "Review PR #456 and suggest improvements"
```

### Query PostgreSQL Database

```bash
claude mcp add --transport stdio db -- npx -y @bytebase/dbhub \
  --dsn "postgresql://readonly:pass@prod.db.com:5432/analytics"
> "What's our total revenue this month?"
```
