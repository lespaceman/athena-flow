---
name: claude-code-plugins
description: Reference documentation for creating and distributing Claude Code plugins. Use when building plugins with skills, agents, hooks, MCP servers, or LSP servers.
user-invocable: false
---

# Create Claude Code Plugins

Plugins let you extend Claude Code with custom functionality that can be shared across projects and teams.

## When to Use Plugins vs Standalone Configuration

| Approach | Skill Names | Best For |
|----------|-------------|----------|
| **Standalone** (`.claude/` directory) | `/hello` | Personal workflows, project-specific, quick experiments |
| **Plugins** (`.claude-plugin/plugin.json`) | `/plugin-name:hello` | Sharing with teammates, community distribution, versioned releases |

## Plugin Structure

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json      # Manifest (required)
├── commands/            # Skills as Markdown files
├── agents/              # Custom agent definitions
├── skills/              # Agent Skills with SKILL.md files
├── hooks/               # Event handlers in hooks.json
├── .mcp.json           # MCP server configurations
└── .lsp.json           # LSP server configurations
```

> **Important:** Don't put `commands/`, `agents/`, `skills/`, or `hooks/` inside `.claude-plugin/`. Only `plugin.json` goes there.

## Plugin Manifest

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "my-plugin",
  "description": "A greeting plugin to learn the basics",
  "version": "1.0.0",
  "author": {
    "name": "Your Name"
  }
}
```

| Field | Purpose |
|-------|---------|
| `name` | Unique identifier and skill namespace (e.g., `/my-plugin:hello`) |
| `description` | Shown in plugin manager |
| `version` | Semantic versioning |
| `author` | Optional attribution |

## Adding Skills (Commands)

Create `commands/hello/SKILL.md`:

```markdown
---
description: Greet the user with a friendly message
disable-model-invocation: true
---

Greet the user warmly and ask how you can help them today.
```

Use `$ARGUMENTS` to capture user input:

```markdown
---
description: Greet the user with a personalized message
---

Greet the user named "$ARGUMENTS" warmly.
```

## Adding Agent Skills

Create `skills/code-review/SKILL.md`:

```yaml
---
name: code-review
description: Reviews code for best practices and potential issues.
---

When reviewing code, check for:
1. Code organization and structure
2. Error handling
3. Security concerns
4. Test coverage
```

## Adding Hooks

Create `hooks/hooks.json`:

```json
{
  "description": "Automatic code formatting",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### Plugin Environment Variables

* `${CLAUDE_PLUGIN_ROOT}`: Absolute path to the plugin directory
* `${CLAUDE_PROJECT_DIR}`: Project root directory

## Adding MCP Servers

Create `.mcp.json` at plugin root:

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

Or inline in `plugin.json`:

```json
{
  "name": "my-plugin",
  "mcpServers": {
    "plugin-api": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/api-server",
      "args": ["--port", "8080"]
    }
  }
}
```

## Adding LSP Servers

Create `.lsp.json` at plugin root:

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

## Testing Plugins Locally

Use `--plugin-dir` flag to load plugins during development:

```bash
claude --plugin-dir ./my-plugin
```

Load multiple plugins:

```bash
claude --plugin-dir ./plugin-one --plugin-dir ./plugin-two
```

## Converting Standalone to Plugin

1. Create plugin structure:
```bash
mkdir -p my-plugin/.claude-plugin
```

2. Create manifest:
```json
{
  "name": "my-plugin",
  "description": "Migrated from standalone configuration",
  "version": "1.0.0"
}
```

3. Copy existing files:
```bash
cp -r .claude/commands my-plugin/
cp -r .claude/agents my-plugin/
cp -r .claude/skills my-plugin/
```

4. Migrate hooks from `settings.json` to `hooks/hooks.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "npm run lint:fix $FILE" }]
      }
    ]
  }
}
```

## Plugin Distribution

1. **Add documentation**: Include a `README.md`
2. **Version your plugin**: Use semantic versioning in `plugin.json`
3. **Create a marketplace**: Distribute through plugin marketplaces
4. **Test with others**: Have team members test before wider distribution

## Key Differences: Standalone vs Plugin

| Standalone (`.claude/`) | Plugin |
|------------------------|--------|
| Only available in one project | Can be shared via marketplaces |
| Files in `.claude/commands/` | Files in `plugin-name/commands/` |
| Hooks in `settings.json` | Hooks in `hooks/hooks.json` |
| Must manually copy to share | Install with `/plugin install` |
