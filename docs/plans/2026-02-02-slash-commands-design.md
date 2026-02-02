# Slash Commands for athena-cli

## Overview

Add a Claude Code-style slash command system to athena-cli. Commands are intercepted at the input layer and routed to handlers before reaching the Claude process. Three command categories: UI commands (control athena-cli), prompt commands (expand into Claude prompts), and hook commands (modify hook event processing).

## Decisions

- **Hybrid architecture**: Built-in commands in TypeScript, user-defined commands from `~/.athena/commands/` (future)
- **Smart session routing**: Each prompt command declares `session: "new"` or `session: "resume"`
- **Inline autocomplete**: Suggestions shown below input when typing after `/`
- **Scope**: Core system + built-in commands. User-defined command loading deferred to follow-up

## 1. Command Registry & Types

### source/commands/types.ts

```typescript
type CommandCategory = 'ui' | 'prompt' | 'hook';
type SessionStrategy = 'new' | 'resume';

interface CommandArg {
	name: string;
	description: string;
	required: boolean;
}

interface CommandBase {
	name: string;
	description: string;
	category: CommandCategory;
	aliases?: string[];
	args?: CommandArg[];
}

interface UICommand extends CommandBase {
	category: 'ui';
	execute: (ctx: UICommandContext) => void;
}

interface PromptCommand extends CommandBase {
	category: 'prompt';
	session: SessionStrategy;
	buildPrompt: (args: Record<string, string>) => string;
}

interface HookCommand extends CommandBase {
	category: 'hook';
	execute: (ctx: HookCommandContext) => void;
}

type Command = UICommand | PromptCommand | HookCommand;
```

### source/commands/registry.ts

Simple `Map<string, Command>` with:

- `register(command)`: Adds command by name + aliases
- `get(name)`: Retrieves command by name or alias
- `getAll()`: Returns unique commands (no alias duplicates)
- Duplicate name throws error

## 2. Input Parser

### source/commands/parser.ts

```typescript
interface ParsedCommand {
	type: 'command';
	name: string;
	rawArgs: string;
	args: Record<string, string>;
}

interface ParsedPrompt {
	type: 'prompt';
	text: string;
}

type ParseResult = ParsedCommand | ParsedPrompt;

function parseInput(input: string): ParseResult;
```

- Input starts with `/` + registered command name/alias -> `ParsedCommand`
- Otherwise -> `ParsedPrompt`
- Arguments are positional, mapped to command's `args` definitions in order

## 3. Command Executor

### source/commands/executor.ts

```typescript
interface UICommandContext {
	messages: Message[];
	setMessages: (msgs: Message[]) => void;
	addMessage: (msg: Message) => void;
	exit: () => void;
}

interface HookCommandContext {
	hookServer: UseHookServerResult;
}

interface PromptCommandContext {
	spawn: (prompt: string, sessionId?: string) => void;
	currentSessionId: string | undefined;
}

type ExecuteCommandContext = {
	ui: UICommandContext;
	hook: HookCommandContext;
	prompt: PromptCommandContext;
};

function executeCommand(
	command: Command,
	args: Record<string, string>,
	ctx: ExecuteCommandContext,
): void;
```

Routing by `command.category`:

- `ui` -> `command.execute(ctx.ui)`
- `prompt` -> `command.buildPrompt(args)` then `ctx.prompt.spawn(prompt, sessionId?)`
- `hook` -> `command.execute(ctx.hook)`

## 4. Inline Autocomplete

### source/components/CommandInput.tsx

Replaces `InputBar` in `app.tsx`. Wraps `TextInput` with suggestion rendering.

**State machine:**

- **Normal mode**: No `/` prefix. No suggestions. Enter submits as prompt.
- **Command mode**: Starts with `/`. Suggestions filtered by prefix match. Up/down navigate. Tab/Enter fills command name. Max 5-6 visible suggestions.

### source/components/CommandSuggestions.tsx

Renders filtered suggestion list:

```
  /commit    Create a git commit      <- highlighted
  /compact   Compact context
```

After command name + space, suggestions disappear (argument typing mode).

## 5. Built-in Commands

### UI Commands

| Command   | Aliases       | Description                                       |
| --------- | ------------- | ------------------------------------------------- |
| `/help`   | `/h`, `/?`    | Lists all available commands                      |
| `/clear`  | `/cls`        | Clears message history                            |
| `/status` |               | Shows server/process/session state + active rules |
| `/quit`   | `/q`, `/exit` | Exits athena-cli                                  |

### Prompt Commands

| Command    | Args            | Session | Description                               |
| ---------- | --------------- | ------- | ----------------------------------------- |
| `/commit`  | `[message]`     | new     | Stages and commits with generated message |
| `/review`  | `[scope]`       | new     | Reviews code changes                      |
| `/explain` | `<file>`        | new     | Explains a file or function               |
| `/fix`     | `[description]` | resume  | Fixes issue from current conversation     |

### Hook Commands

| Command         | Args     | Description                               |
| --------------- | -------- | ----------------------------------------- |
| `/block`        | `<tool>` | Blocks a tool from executing              |
| `/unblock`      | `<tool>` | Removes tool from deny list               |
| `/auto-approve` | `[tool]` | Auto-passthrough PreToolUse events        |
| `/manual`       |          | Returns to default 250ms auto-passthrough |

## 6. Hook Server Rules Engine

### Types

```typescript
type RuleAction = 'deny' | 'approve';

interface HookRule {
	id: string;
	toolName: string; // '*' for all tools
	action: RuleAction;
	addedBy: string; // command that created it
}
```

### Behavior

Event processing order:

1. Event arrives
2. Check rules (deny rules first, then approve, first match wins)
3. Match found with `deny` -> immediately respond with block result
4. Match found with `approve` -> immediately respond with passthrough
5. No match -> fall through to existing 250ms auto-passthrough

Rules only apply to `PreToolUse` events.

### useHookServer additions

```typescript
interface UseHookServerResult {
	// ...existing
	rules: HookRule[];
	addRule: (rule: Omit<HookRule, 'id'>) => void;
	removeRule: (id: string) => void;
	clearRules: () => void;
}
```

## 7. File Structure

```
source/
├── commands/
│   ├── types.ts
│   ├── registry.ts
│   ├── parser.ts
│   ├── executor.ts
│   ├── builtins/
│   │   ├── index.ts         # Registers all built-in commands
│   │   ├── help.ts
│   │   ├── clear.ts
│   │   ├── status.ts
│   │   ├── quit.ts
│   │   ├── commit.ts
│   │   ├── review.ts
│   │   ├── explain.ts
│   │   ├── fix.ts
│   │   ├── block.ts
│   │   ├── unblock.ts
│   │   ├── autoApprove.ts
│   │   └── manual.ts
│   └── __tests__/
│       ├── parser.test.ts
│       ├── registry.test.ts
│       └── executor.test.ts
├── components/
│   ├── CommandInput.tsx
│   ├── CommandSuggestions.tsx
│   └── ...existing
```

### Changes to existing files

- **app.tsx**: Replace `InputBar` with `CommandInput`. Update `handleSubmit` to route through parser/executor.
- **useHookServer.ts**: Add `rules` state, `addRule`/`removeRule`/`clearRules`, rule checking before auto-passthrough.
- **types/index.ts**: Re-export command types.

No changes to: `hook-forwarder.ts`, `cli.tsx`, `HookContext.tsx`, existing components.

## 8. Testing Strategy

### Unit tests (high coverage)

**parser.test.ts:**

- `/commit message` -> ParsedCommand
- `/unknown foo` -> ParsedPrompt (unregistered)
- `hello world` -> ParsedPrompt
- `/` alone -> ParsedPrompt
- `/h` -> resolves alias
- Edge cases: whitespace, empty args, special characters

**registry.test.ts:**

- Register and retrieve by name
- Register and retrieve by alias
- `getAll()` deduplicates aliases
- Duplicate name throws

**executor.test.ts:**

- UI command receives UICommandContext
- Prompt command with `session: "new"` spawns without session ID
- Prompt command with `session: "resume"` passes current session ID
- Hook command receives HookCommandContext

**useHookServer rule engine:**

- Deny rule blocks matching PreToolUse
- Approve rule passthroughs matching events
- Deny precedence over approve
- Wildcard `*` matches all tools
- Non-PreToolUse events ignore rules
- removeRule / clearRules work

### Component tests (lighter)

- CommandSuggestions renders filtered list
- CommandInput shows suggestions when input starts with `/`

## Future Work (out of scope)

- User-defined commands from `~/.athena/commands/` (markdown + frontmatter)
- Argument autocomplete (file paths, tool names)
- Command history / recent commands
- Template engine for prompt commands (handlebars-style variable substitution)
