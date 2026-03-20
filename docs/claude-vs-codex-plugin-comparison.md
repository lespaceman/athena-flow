# Claude Plugin vs Codex Plugin — Comparison & Athena Integration

> How each plugin system works, what they support, and how athena bridges both.

---

## 1. Structural Comparison

### Manifest & Identity

| Aspect           | Claude Plugin                             | Codex Plugin                                         |
| ---------------- | ----------------------------------------- | ---------------------------------------------------- |
| **Manifest**     | `.claude-plugin/plugin.json` (local)      | No local manifest — `marketplaceName` + `pluginName` |
| **Discovery**    | Filesystem scan of plugin dirs            | Marketplace lookup via `plugin/install` RPC          |
| **Installation** | Resolved by athena (`src/infra/plugins/`) | Handled internally by Codex binary                   |
| **Identity**     | Directory path + `plugin.json` name       | Registry namespace + plugin name                     |

### Claude Plugin Manifest

```typescript
// src/infra/plugins/types.ts
type PluginManifest = {
	name: string; // Unique kebab-case identifier
	description: string;
	version: string;
	author?: {name: string};
	repository?: string;
};
```

Codex has **no equivalent local manifest type** — plugins are identified by marketplace coordinates.

### Directory Layout

```
Claude Plugin:                    Codex Plugin:
plugin-name/                      (managed by Codex binary)
├── .claude-plugin/               ├── skills/
│   └── plugin.json  (required)   │   └── skill-name/
├── skills/                       │       ├── SKILL.md
│   └── skill-name/               │       └── SKILL.json (optional)
│       └── SKILL.md              └── (internal structure unknown)
├── agents/
│   └── agent-name.md
├── hooks/
│   └── hooks.json
├── commands/
│   └── command.md
├── .mcp.json
├── .lsp.json
└── workflow.json (optional)
```

### Component Support

| Component                     | Claude Plugin | Codex Plugin                                                                             |
| ----------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| **Skills** (SKILL.md)         | First-class   | First-class                                                                              |
| **MCP servers** (.mcp.json)   | First-class   | Via `config` on `thread/start`                                                           |
| **Agents** (agents/\*.md)     | First-class   | Via `[agents.*]` in config.toml (requires `features.multi_agent`) + runtime CollabAgents |
| **Hooks** (hooks/)            | First-class   | **None**                                                                                 |
| **Commands** (commands/)      | First-class   | **None**                                                                                 |
| **LSP servers** (.lsp.json)   | First-class   | **None**                                                                                 |
| **Workflows** (workflow.json) | Via athena    | **None**                                                                                 |

---

## 2. Skill Format Comparison

Both use SKILL.md files, but with different metadata models.

### Claude Skill (parsed by athena)

```typescript
// src/infra/plugins/types.ts
type SkillFrontmatter = {
	name: string;
	description: string;
	'user-invocable'?: boolean; // Determines if user can invoke directly
	'argument-hint'?: string; // Hint for arguments
	'allowed-tools'?: string[]; // Tool access restriction
};

type ParsedSkill = {
	frontmatter: SkillFrontmatter;
	body: string; // Markdown body (supports $ARGUMENTS placeholder)
};
```

### Codex Skill (returned by `skills/list` RPC)

```typescript
// src/harnesses/codex/protocol/generated/v2/SkillMetadata.ts
type SkillMetadata = {
	name: string;
	description: string;
	shortDescription?: string;
	interface?: SkillInterface; // UI metadata: icons, colors, defaultPrompt
	dependencies?: SkillDependencies; // MCP server deps declared inline
	path: string; // Absolute path on disk
	scope: SkillScope; // 'user' | 'repo' | 'system' | 'admin'
	enabled: boolean;
};
```

### Key Differences

|                       | Claude                                  | Codex                                                 |
| --------------------- | --------------------------------------- | ----------------------------------------------------- |
| **Invocability**      | `user-invocable` boolean                | `enabled` boolean + `scope`                           |
| **Tool restrictions** | `allowed-tools` array                   | No equivalent in metadata                             |
| **UI metadata**       | None                                    | `SkillInterface` (icons, brand color, default prompt) |
| **Dependencies**      | Implicit via `.mcp.json` at plugin root | Explicit `SkillDependencies` per skill                |
| **Argument support**  | `$ARGUMENTS` placeholder in body        | `defaultPrompt` in interface                          |

---

## 3. Marketplace Comparison

### Claude Marketplace (GitHub-based)

```typescript
// src/infra/plugins/marketplace.ts
type MarketplaceManifest = {
	name: string;
	owner: {name: string; email?: string};
	metadata?: {
		description?: string;
		version?: string;
		pluginRoot?: string;
		workflowRoot?: string;
	};
	plugins: MarketplaceEntry[];
	workflows?: MarketplaceEntry[];
};

type MarketplaceEntry = {
	name: string;
	source: string | {source: string; [key: string]: unknown};
	description?: string;
	version?: string;
};
```

- Located at `.claude-plugin/marketplace.json` in GitHub repos
- Plugin refs use format `plugin-name@owner/repo`
- No review/approval system
- No per-tool configuration

### Codex Marketplace (Hazelnut + App Registry)

```typescript
// AppInfo — full marketplace record
type AppInfo = {
  id: string;
  name: string;
  description: string | null;
  branding: AppBranding | null;         // developer, website, privacy, ToS
  appMetadata: AppMetadata | null;      // review, categories, screenshots, version
  isAccessible: boolean;
  isEnabled: boolean;
  pluginDisplayNames: Array<string>;    // Links app → plugin(s)
  // ...
};

// Per-app configuration with tool-level control
type AppsConfig = { _default: AppsDefaultConfig | null } & {
  [appId: string]?: {
    enabled: boolean;
    destructive_enabled: boolean | null;
    open_world_enabled: boolean | null;
    default_tools_approval_mode: AppToolApproval | null; // 'auto' | 'prompt' | 'approve'
    tools: AppToolsConfig | null;                        // Per-tool enable + approval
  };
};

// Remote skill marketplace
type HazelnutScope = 'example' | 'workspace-shared' | 'all-shared' | 'personal';
type ProductSurface = 'chatgpt' | 'codex' | 'api' | 'atlas';
```

- Full review system (`AppReview`)
- Cross-product surface (`chatgpt`, `codex`, `api`, `atlas`)
- Per-tool approval modes
- Screenshots and SEO metadata

---

## 4. How Athena Handles Claude Plugins

### Plugin Infrastructure (`src/infra/plugins/`)

Athena has a **harness-agnostic plugin layer** that handles discovery, loading, and registration
before any harness-specific code runs.

```
Config Sources                        Shared Infrastructure              Harness-Specific
─────────────                         ─────────────────────              ────────────────
~/.config/athena/config.json  ──┐
.athena/config.json           ──┤     registerPlugins()                 Claude Harness
--plugin CLI flags            ──┼──→  src/infra/plugins/register.ts ──→ --plugin-dir flags
Active workflow plugins       ──┘     │                                 --mcp-config flag
                                      ├─ loadPlugin() per dir
                                      ├─ Parse plugin.json              Codex Harness
                                      ├─ Scan skills/ → SKILL.md   ──→ skills/list RPC
                                      ├─ Register PromptCommands        config.mcp_servers
                                      ├─ Merge .mcp.json files
                                      └─ Discover workflow.json
```

### Key Files

| File                               | Purpose                                             |
| ---------------------------------- | --------------------------------------------------- |
| `src/infra/plugins/types.ts`       | `PluginManifest`, `SkillFrontmatter`, `ParsedSkill` |
| `src/infra/plugins/loader.ts`      | Plugin directory parsing, SKILL.md loading          |
| `src/infra/plugins/frontmatter.ts` | YAML frontmatter parser                             |
| `src/infra/plugins/register.ts`    | Plugin registration + MCP config merging            |
| `src/infra/plugins/mcpOptions.ts`  | MCP server option discovery from `.mcp.json`        |
| `src/infra/plugins/config.ts`      | Config reading (`AthenaConfig`)                     |
| `src/infra/plugins/marketplace.ts` | Marketplace manifest resolution                     |

### Plugin Loading Pipeline

```typescript
// src/infra/plugins/loader.ts — simplified flow
function loadPlugin(pluginDir: string): PromptCommand[] {
	// 1. Validate .claude-plugin/plugin.json exists
	// 2. Scan skills/ directory for SKILL.md files
	// 3. Parse YAML frontmatter from each SKILL.md
	// 4. Filter to user-invocable === true only
	// 5. Convert each to PromptCommand
	// 6. Detect .mcp.json for MCP server config
}
```

### MCP Config Merging

```typescript
// src/infra/plugins/register.ts — simplified flow
function registerPlugins(
	pluginDirs: string[],
	mcpServerOptions?: McpServerChoices,
): PluginRegistrationResult {
	// 1. Load each plugin
	// 2. Register commands globally
	// 3. Collect all .mcp.json configs
	// 4. Check for server name collisions (throws on duplicate)
	// 5. Apply user-selected MCP options
	// 6. Write merged config to /tmp/athena-mcp-{pid}.json
	// Returns { mcpConfig?: string, workflows: WorkflowConfig[] }
}
```

### Config System

```typescript
// src/infra/plugins/config.ts
type AthenaConfig = {
	plugins: string[]; // Plugin paths or marketplace refs
	additionalDirectories: string[];
	model?: string;
	activeWorkflow?: string;
	workflowMarketplaceSource?: string; // GitHub owner/repo
	workflowSelections?: WorkflowSelections;
	harness?: 'claude-code' | 'openai-codex' | 'opencode';
	// ...
};
```

### Plugin Dir Merging Priority

```typescript
// src/app/bootstrap/bootstrapConfig.ts
const pluginDirs = mergePluginDirs({
	workflowPluginDirs, // Highest — from active workflow
	globalPlugins, // From ~/.config/athena/config.json
	projectPlugins, // From .athena/config.json
	pluginFlags, // From CLI --plugin flags
});
```

---

## 5. Harness-Specific Plugin Handling

### Claude Harness

```typescript
// src/harnesses/claude/adapter.ts
// Claude Code natively understands the plugin structure

spawnClaude({
	args: [
		...pluginDirs.flatMap(d => ['--plugin-dir', d]), // Plugin dirs
		'--mcp-config',
		pluginMcpConfig, // Merged MCP config
	],
});
```

Claude Code handles internally:

- Skill loading and invocation
- Agent discovery from `agents/` dirs
- Hook registration from `hooks/`
- Command registration from `commands/`
- MCP server lifecycle
- LSP server integration

### Codex Harness

```typescript
// src/harnesses/codex/session/sessionAssets.ts
function resolveCodexWorkflowSkillRoots(workflowPlan?: WorkflowPlan): string[] {
  return workflowPlan.pluginDirs
    .map(dir => path.join(dir, 'skills'))
    .filter(dir => fs.existsSync(dir));
}

// src/harnesses/codex/runtime/server.ts
// 1. Load skills via RPC
await manager.sendRequest('skills/list', {
  perCwdExtraUserRoots: [{ cwd: projectDir, extraUserRoots: skillRoots }]
});

// 2. Generate text instructions from skill metadata
const instructions = resolveCodexSkillInstructions(...);

// 3. Start thread with instructions + MCP config
await manager.sendRequest('thread/start', {
  developerInstructions: instructions,
  config: { mcp_servers: mergedMcpConfig },
});
```

### What Each Harness Receives from a Claude Plugin

| Plugin Component              | Claude Harness               | Codex Harness                                                                   |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| **Skills** (SKILL.md)         | Native via `--plugin-dir`    | Via `skills/list` RPC → text injection                                          |
| **MCP servers** (.mcp.json)   | Native via `--mcp-config`    | Via `config` on `thread/start`                                                  |
| **Agents** (agents/\*.md)     | Native support               | Via `config/batchWrite` to `[agents.*]` in config.toml + temp TOML config files |
| **Hooks** (hooks/)            | Via hook forwarder + UDS     | **Dropped**                                                                     |
| **Commands** (commands/)      | Registered as PromptCommands | **Dropped**                                                                     |
| **LSP servers** (.lsp.json)   | Native support               | **Dropped**                                                                     |
| **Workflows** (workflow.json) | Registered in athena         | Registered in athena                                                            |

---

## 6. Workflow Integration

Workflows are an athena-level concept that sit above both harnesses and reference plugins.

```typescript
// src/core/workflows/types.ts
type WorkflowConfig = {
	name: string;
	description?: string;
	version?: string;
	plugins: string[]; // Plugin paths or marketplace refs
	promptTemplate: string;
	loop?: LoopConfig;
	isolation?: string; // 'strict' | 'minimal' | 'permissive'
	model?: string;
	env?: Record<string, string>;
	systemPromptFile?: string;
};
```

```typescript
// src/core/workflows/plan.ts
type WorkflowPlan = {
	workflow: WorkflowConfig;
	pluginDirs: string[]; // Resolved absolute paths
	pluginMcpConfig?: string; // Merged MCP config temp file
};
```

The `WorkflowPlan` is consumed by both harnesses, but each extracts different things:

- **Claude**: uses `pluginDirs` as `--plugin-dir` flags (full plugin support)
- **Codex**: extracts `pluginDirs/*/skills/` as skill roots, merges MCP configs separately

---

## 7. Hook System (Claude Only)

Athena implements a hook forwarding system for Claude plugins:

```
Claude Code ──hook event──→ athena-hook-forwarder ──UDS──→ Athena Hook Server
                                                            │
                                                            ├─ PreToolUse
                                                            ├─ PostToolUse
                                                            ├─ PermissionRequest
                                                            ├─ SessionStart
                                                            └─ SessionEnd
                                                            │
Claude Code ←─decision────← athena-hook-forwarder ←─UDS──← (allow/block/ask)
```

**Key files:**

- `src/harnesses/claude/hook-forwarder.ts` — standalone Node.js script
- `src/harnesses/claude/hooks/generateHookSettings.ts` — generates hook config

Codex has **no hook equivalent** in its protocol.

---

## 8. Isolation Configuration (Claude Only)

Claude plugins can specify tool access restrictions via isolation configs:

```typescript
// src/harnesses/claude/config/isolation.ts
type IsolationConfig = {
	preset?: 'strict' | 'minimal' | 'permissive';
	allowedTools?: string[];
	disallowedTools?: string[];
	mcpConfig?: string;
	strictMcpConfig?: boolean; // Block project MCP servers
	// ...40+ additional fields
};
```

Skills loaded from plugins with `.mcp.json` get:

```typescript
isolation: {
	mcpConfig: mcpConfigPath;
}
```

Codex uses `AppsConfig` with `AppToolApproval` for similar purposes but at the app level,
not the skill level.

---

## 9. Gaps & Opportunities

### Components requiring translation for Codex

| Component       | Codex Path                                                                                        | Status                                                 |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Agents**      | `config/batchWrite` to write `[agents.*]` roles in config.toml + temp TOML `config_file` per role | Implementable — requires `features.multi_agent = true` |
| **Hooks**       | No equivalent — would need protocol extension                                                     | Not feasible                                           |
| **Commands**    | Could be injected as skills or into `developerInstructions`                                       | Partial workaround                                     |
| **LSP servers** | No equivalent in Codex protocol                                                                   | Not feasible                                           |

> **Note on `externalAgentConfig/import`**: This is a **one-time migration tool** that writes
> permanently to disk. It is NOT suitable for per-session agent injection. Use `config/batchWrite`
> for dynamic, workflow-scoped agent loading instead.

### Codex native agent role system

Codex supports pre-configured agent roles via `config.toml`:

```toml
[features]
multi_agent = true

[agents.reviewer]
description = "Reviews code for quality"
config_file = "/path/to/reviewer.toml"
```

- Only `description` and `config_file` fields are allowed (Codex rejects unknown fields)
- Built-in roles: `default`, `worker`, `explorer`, `monitor`
- Athena's approach: parse plugin `agents/*.md` → generate temp TOML files → write `[agents.*]` entries via `config/batchWrite`
- Alternative: pass agent config in `thread/start` `config` bag (open `additionalProperties: true`) — needs empirical validation

### Feature parity gaps

| Feature                     | Claude                         | Codex                                    |
| --------------------------- | ------------------------------ | ---------------------------------------- |
| Per-skill tool restrictions | `allowed-tools` in frontmatter | Not supported                            |
| Skill argument hints        | `argument-hint` + `$ARGUMENTS` | `defaultPrompt` in `SkillInterface`      |
| Review/approval system      | None                           | `AppReview` + `AppToolApproval`          |
| Remote skill sharing        | None                           | Hazelnut marketplace with scopes         |
| Cross-product distribution  | Claude Code only               | `chatgpt`, `codex`, `api`, `atlas`       |
| Skill UI customization      | None                           | Icons, brand colors via `SkillInterface` |
| File watch invalidation     | None                           | `skills/changed` notification            |
