# Permission Prompt UX/UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the interactive permission prompt to provide risk-aware, context-rich decisions with single-key activation

**Architecture:** Extend the existing `PermissionDialog` component with risk tier classification, enhanced tool name parsing, collapsible details, and keyboard shortcut handling using Ink's `useInput` hook. Create new utility modules for risk assessment and tool metadata extraction.

**Tech Stack:** Ink (React for CLIs), TypeScript, @inkjs/ui, vitest

---

## Task 1: Extend Tool Name Parser for Richer Metadata

**Files:**

- Modify: `source/utils/toolNameParser.ts`
- Test: `source/utils/toolNameParser.test.ts`

### Step 1: Write the failing tests for extended parser

```typescript
// source/utils/toolNameParser.test.ts
import {describe, it, expect} from 'vitest';
import {parseToolName, type ParsedToolName} from './toolNameParser.js';

describe('parseToolName', () => {
	describe('MCP tools', () => {
		it('parses mcp tool into server and action', () => {
			const result = parseToolName('mcp__agent-web-interface__go_back');
			expect(result).toEqual({
				displayName: 'go_back',
				isMcp: true,
				mcpServer: 'agent-web-interface',
				mcpAction: 'go_back',
				serverLabel: 'agent-web-interface (MCP)',
			});
		});

		it('handles underscores in server name', () => {
			const result = parseToolName('mcp__web_testing_toolkit__click');
			expect(result).toEqual({
				displayName: 'click',
				isMcp: true,
				mcpServer: 'web_testing_toolkit',
				mcpAction: 'click',
				serverLabel: 'web_testing_toolkit (MCP)',
			});
		});

		it('handles plugin prefix pattern', () => {
			const result = parseToolName(
				'mcp__plugin_web-testing-toolkit_agent-web-interface__navigate',
			);
			expect(result).toEqual({
				displayName: 'navigate',
				isMcp: true,
				mcpServer: 'plugin_web-testing-toolkit_agent-web-interface',
				mcpAction: 'navigate',
				serverLabel: 'agent-web-interface (MCP)',
			});
		});
	});

	describe('Skill tool', () => {
		it('returns Skill with skill name in server label', () => {
			const result = parseToolName('Skill');
			expect(result).toEqual({
				displayName: 'Skill',
				isMcp: false,
				serverLabel: undefined,
			});
		});
	});

	describe('Built-in tools', () => {
		it('returns built-in tool name as-is', () => {
			const result = parseToolName('Bash');
			expect(result).toEqual({
				displayName: 'Bash',
				isMcp: false,
				serverLabel: undefined,
			});
		});

		it('handles Edit tool', () => {
			const result = parseToolName('Edit');
			expect(result).toEqual({
				displayName: 'Edit',
				isMcp: false,
				serverLabel: undefined,
			});
		});
	});
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/utils/toolNameParser.test.ts`
Expected: FAIL - serverLabel property doesn't exist

### Step 3: Update ParsedToolName type and parseToolName function

```typescript
// source/utils/toolNameParser.ts
export type ParsedToolName = {
	displayName: string;
	isMcp: boolean;
	mcpServer?: string;
	mcpAction?: string;
	/** Human-readable server/source label, e.g. "agent-web-interface (MCP)" */
	serverLabel?: string;
};

export function parseToolName(toolName: string): ParsedToolName {
	// MCP tool pattern: mcp__server__action
	const match = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(toolName);
	if (match) {
		const mcpServer = match[1]!;
		const mcpAction = match[2]!;

		// Extract friendly server name from plugin prefix pattern
		// e.g., "plugin_web-testing-toolkit_agent-web-interface" → "agent-web-interface"
		let friendlyServer = mcpServer;
		const pluginMatch = /^plugin_[^_]+_(.+)$/.exec(mcpServer);
		if (pluginMatch) {
			friendlyServer = pluginMatch[1]!;
		}

		return {
			displayName: mcpAction,
			isMcp: true,
			mcpServer,
			mcpAction,
			serverLabel: `${friendlyServer} (MCP)`,
		};
	}

	return {
		displayName: toolName,
		isMcp: false,
		serverLabel: undefined,
	};
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/utils/toolNameParser.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add source/utils/toolNameParser.ts source/utils/toolNameParser.test.ts
git commit -m "$(cat <<'EOF'
feat(toolNameParser): add serverLabel and improve MCP parsing

Extend ParsedToolName with serverLabel for displaying tool source context.
Improve MCP parsing to extract friendly server names from plugin prefixes.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create Risk Tier Classification System

**Files:**

- Create: `source/services/riskTier.ts`
- Create: `source/services/riskTier.test.ts`

### Step 1: Write the failing tests for risk tier classification

```typescript
// source/services/riskTier.test.ts
import {describe, it, expect} from 'vitest';
import {getRiskTier, type RiskTier, RISK_TIER_CONFIG} from './riskTier.js';

describe('getRiskTier', () => {
	describe('READ tier', () => {
		it('classifies Read as READ', () => {
			expect(getRiskTier('Read')).toBe('READ');
		});

		it('classifies Glob as READ', () => {
			expect(getRiskTier('Glob')).toBe('READ');
		});

		it('classifies Grep as READ', () => {
			expect(getRiskTier('Grep')).toBe('READ');
		});

		it('classifies WebSearch as READ', () => {
			expect(getRiskTier('WebSearch')).toBe('READ');
		});

		it('classifies MCP navigation tools as READ', () => {
			expect(getRiskTier('mcp__agent-web-interface__go_back')).toBe('READ');
			expect(getRiskTier('mcp__agent-web-interface__go_forward')).toBe('READ');
			expect(getRiskTier('mcp__agent-web-interface__capture_snapshot')).toBe(
				'READ',
			);
			expect(getRiskTier('mcp__agent-web-interface__find_elements')).toBe(
				'READ',
			);
		});
	});

	describe('MODERATE tier', () => {
		it('classifies Task as MODERATE', () => {
			expect(getRiskTier('Task')).toBe('MODERATE');
		});

		it('classifies WebFetch as MODERATE', () => {
			expect(getRiskTier('WebFetch')).toBe('MODERATE');
		});

		it('classifies MCP click/type as MODERATE', () => {
			expect(getRiskTier('mcp__agent-web-interface__click')).toBe('MODERATE');
			expect(getRiskTier('mcp__agent-web-interface__type')).toBe('MODERATE');
		});
	});

	describe('WRITE tier', () => {
		it('classifies Edit as WRITE', () => {
			expect(getRiskTier('Edit')).toBe('WRITE');
		});

		it('classifies Write as WRITE', () => {
			expect(getRiskTier('Write')).toBe('WRITE');
		});

		it('classifies NotebookEdit as WRITE', () => {
			expect(getRiskTier('NotebookEdit')).toBe('WRITE');
		});
	});

	describe('DESTRUCTIVE tier', () => {
		it('classifies Bash as DESTRUCTIVE', () => {
			expect(getRiskTier('Bash')).toBe('DESTRUCTIVE');
		});
	});

	describe('unknown tools', () => {
		it('defaults unknown tools to MODERATE', () => {
			expect(getRiskTier('UnknownTool')).toBe('MODERATE');
		});

		it('defaults unknown MCP tools to MODERATE', () => {
			expect(getRiskTier('mcp__unknown__action')).toBe('MODERATE');
		});
	});
});

describe('RISK_TIER_CONFIG', () => {
	it('has correct config for READ tier', () => {
		expect(RISK_TIER_CONFIG.READ).toEqual({
			label: 'READ',
			icon: 'ℹ',
			color: 'cyan',
			autoAllow: true,
		});
	});

	it('has correct config for DESTRUCTIVE tier', () => {
		expect(RISK_TIER_CONFIG.DESTRUCTIVE).toEqual({
			label: 'DESTRUCTIVE',
			icon: '⛔',
			color: 'red',
			requiresConfirmation: true,
		});
	});
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/services/riskTier.test.ts`
Expected: FAIL - module does not exist

### Step 3: Implement risk tier classification

```typescript
// source/services/riskTier.ts
export type RiskTier = 'READ' | 'MODERATE' | 'WRITE' | 'DESTRUCTIVE';

export type RiskTierConfig = {
	label: string;
	icon: string;
	color: 'cyan' | 'yellow' | 'red';
	autoAllow?: boolean;
	requiresConfirmation?: boolean;
};

export const RISK_TIER_CONFIG: Record<RiskTier, RiskTierConfig> = {
	READ: {
		label: 'READ',
		icon: 'ℹ',
		color: 'cyan',
		autoAllow: true,
	},
	MODERATE: {
		label: 'MODERATE',
		icon: '⚠',
		color: 'yellow',
	},
	WRITE: {
		label: 'WRITE',
		icon: '⚠',
		color: 'yellow',
	},
	DESTRUCTIVE: {
		label: 'DESTRUCTIVE',
		icon: '⛔',
		color: 'red',
		requiresConfirmation: true,
	},
};

/** Read-only tools - auto-allow by default */
const READ_TOOLS = new Set([
	'Read',
	'Glob',
	'Grep',
	'WebSearch',
	'TodoRead',
	'AskUserQuestion',
]);

/** Read-only MCP action patterns */
const READ_MCP_ACTIONS = new Set([
	'go_back',
	'go_forward',
	'reload',
	'capture_snapshot',
	'find_elements',
	'get_element_details',
	'take_screenshot',
	'scroll_page',
	'scroll_element_into_view',
	'list_pages',
	'ping',
	'get_form_understanding',
	'get_field_context',
]);

/** Moderate risk tools */
const MODERATE_TOOLS = new Set(['Task', 'WebFetch', 'Skill', 'TodoWrite']);

/** Moderate risk MCP actions */
const MODERATE_MCP_ACTIONS = new Set([
	'click',
	'type',
	'press',
	'select',
	'hover',
	'navigate',
]);

/** Write tools - file modifications */
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

/** Destructive tools - can cause irreversible changes */
const DESTRUCTIVE_TOOLS = new Set(['Bash']);

/**
 * Classify a tool by its risk tier based on side-effect profile.
 */
export function getRiskTier(toolName: string): RiskTier {
	// Check built-in tool sets first
	if (READ_TOOLS.has(toolName)) return 'READ';
	if (MODERATE_TOOLS.has(toolName)) return 'MODERATE';
	if (WRITE_TOOLS.has(toolName)) return 'WRITE';
	if (DESTRUCTIVE_TOOLS.has(toolName)) return 'DESTRUCTIVE';

	// Check MCP tools by action name
	const mcpMatch = /^mcp__[^_]+(?:_[^_]+)*__(.+)$/.exec(toolName);
	if (mcpMatch) {
		const action = mcpMatch[1]!;
		if (READ_MCP_ACTIONS.has(action)) return 'READ';
		if (MODERATE_MCP_ACTIONS.has(action)) return 'MODERATE';
		// Unknown MCP actions default to MODERATE
		return 'MODERATE';
	}

	// Unknown tools default to MODERATE
	return 'MODERATE';
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/services/riskTier.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add source/services/riskTier.ts source/services/riskTier.test.ts
git commit -m "$(cat <<'EOF'
feat(riskTier): add risk tier classification for tools

Classify tools into READ, MODERATE, WRITE, and DESTRUCTIVE tiers based on
their side-effect profile. Includes visual config (icon, color) for each tier.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create Args Formatter Utility

**Files:**

- Modify: `source/utils/toolNameParser.ts`
- Test: `source/utils/toolNameParser.test.ts`

### Step 1: Write failing tests for formatArgs function

```typescript
// Add to source/utils/toolNameParser.test.ts
import {formatArgs} from './toolNameParser.js';

describe('formatArgs', () => {
	it('returns "(none)" for empty object', () => {
		expect(formatArgs({})).toBe('(none)');
	});

	it('returns "(none)" for undefined', () => {
		expect(formatArgs(undefined)).toBe('(none)');
	});

	it('formats single string arg', () => {
		expect(formatArgs({command: 'ls -la'})).toBe('command: "ls -la"');
	});

	it('formats multiple args', () => {
		const result = formatArgs({file_path: '/tmp/test.ts', content: 'hello'});
		expect(result).toBe('file_path: "/tmp/test.ts", content: "hello"');
	});

	it('truncates long string values', () => {
		const longValue = 'a'.repeat(100);
		const result = formatArgs({content: longValue});
		expect(result).toContain('...');
		expect(result.length).toBeLessThan(100);
	});

	it('formats boolean values', () => {
		expect(formatArgs({clear: true})).toBe('clear: true');
	});

	it('formats number values', () => {
		expect(formatArgs({timeout: 5000})).toBe('timeout: 5000');
	});

	it('truncates output to maxLength', () => {
		const args = {
			a: 'value1',
			b: 'value2',
			c: 'value3',
			d: 'value4',
		};
		const result = formatArgs(args, 30);
		expect(result.length).toBeLessThanOrEqual(33); // 30 + "..."
	});
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/utils/toolNameParser.test.ts`
Expected: FAIL - formatArgs not exported

### Step 3: Implement formatArgs function

```typescript
// Add to source/utils/toolNameParser.ts

/**
 * Format tool args for compact display in permission prompt.
 * Returns "(none)" for empty/undefined input.
 */
export function formatArgs(
	input: Record<string, unknown> | undefined,
	maxLength = 80,
): string {
	if (!input || Object.keys(input).length === 0) {
		return '(none)';
	}

	const entries = Object.entries(input);
	const parts: string[] = [];

	for (const [key, val] of entries) {
		let formatted: string;
		if (typeof val === 'string') {
			// Truncate long strings at 40 chars
			const truncated = val.length > 40 ? val.slice(0, 37) + '...' : val;
			formatted = `${key}: "${truncated}"`;
		} else if (typeof val === 'boolean' || typeof val === 'number') {
			formatted = `${key}: ${val}`;
		} else {
			// For objects/arrays, show type hint
			formatted = `${key}: [${typeof val}]`;
		}
		parts.push(formatted);
	}

	const full = parts.join(', ');
	if (full.length <= maxLength) {
		return full;
	}

	// Truncate with ellipsis
	return full.slice(0, maxLength - 3) + '...';
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/utils/toolNameParser.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add source/utils/toolNameParser.ts source/utils/toolNameParser.test.ts
git commit -m "$(cat <<'EOF'
feat(toolNameParser): add formatArgs for compact arg display

Format tool arguments as a compact key-value string for the permission prompt.
Returns "(none)" for empty args, truncates long values.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create KeybindingBar Component

**Files:**

- Create: `source/components/KeybindingBar.tsx`
- Create: `source/components/KeybindingBar.test.tsx`

### Step 1: Write failing tests for KeybindingBar

```typescript
// source/components/KeybindingBar.test.tsx
import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import KeybindingBar from './KeybindingBar.js';

describe('KeybindingBar', () => {
  it('renders all keybindings', () => {
    const {lastFrame} = render(
      <KeybindingBar toolName="Bash" serverLabel={undefined} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('a');
    expect(frame).toContain('Allow');
    expect(frame).toContain('d');
    expect(frame).toContain('Deny');
    expect(frame).toContain('A');
    expect(frame).toContain('D');
  });

  it('shows default indicator on Deny', () => {
    const {lastFrame} = render(
      <KeybindingBar toolName="Bash" serverLabel={undefined} />,
    );
    expect(lastFrame()).toContain('(default)');
  });

  it('includes tool name in always options', () => {
    const {lastFrame} = render(
      <KeybindingBar toolName="Edit" serverLabel={undefined} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Edit');
  });

  it('includes server label when provided', () => {
    const {lastFrame} = render(
      <KeybindingBar toolName="click" serverLabel="agent-web-interface (MCP)" />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('agent-web-interface');
  });

  it('shows info toggle hint', () => {
    const {lastFrame} = render(
      <KeybindingBar toolName="Bash" serverLabel={undefined} />,
    );
    expect(lastFrame()).toContain('i');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/components/KeybindingBar.test.ts`
Expected: FAIL - module not found

### Step 3: Implement KeybindingBar component

```typescript
// source/components/KeybindingBar.tsx
import React from 'react';
import {Box, Text} from 'ink';

type Props = {
  toolName: string;
  serverLabel?: string;
};

export default function KeybindingBar({toolName, serverLabel}: Props) {
  const scopeLabel = serverLabel ? `"${toolName}" on ${serverLabel}` : `"${toolName}"`;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box gap={2}>
        <Box>
          <Text bold color="green">a</Text>
          <Text> Allow</Text>
        </Box>
        <Box>
          <Text bold color="red">d</Text>
          <Text> Deny </Text>
          <Text dimColor>(default)</Text>
        </Box>
        <Box>
          <Text dimColor>i</Text>
          <Text dimColor> Details</Text>
        </Box>
      </Box>
      <Box gap={2} marginTop={0}>
        <Box>
          <Text bold color="green">A</Text>
          <Text> Always allow {scopeLabel}</Text>
        </Box>
      </Box>
      <Box gap={2}>
        <Box>
          <Text bold color="red">D</Text>
          <Text> Always deny {scopeLabel}</Text>
        </Box>
      </Box>
    </Box>
  );
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/components/KeybindingBar.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add source/components/KeybindingBar.tsx source/components/KeybindingBar.test.tsx
git commit -m "$(cat <<'EOF'
feat(KeybindingBar): add keyboard shortcut bar component

Display permission decision keybindings with visual hierarchy.
Shows scope-explicit labels for "always" actions.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create RawPayloadDetails Component

**Files:**

- Create: `source/components/RawPayloadDetails.tsx`
- Create: `source/components/RawPayloadDetails.test.tsx`

### Step 1: Write failing tests for RawPayloadDetails

```typescript
// source/components/RawPayloadDetails.test.tsx
import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import RawPayloadDetails from './RawPayloadDetails.js';

describe('RawPayloadDetails', () => {
  it('shows collapsed state by default', () => {
    const {lastFrame} = render(
      <RawPayloadDetails
        rawToolName="mcp__server__action"
        payload={{key: 'value'}}
        isExpanded={false}
      />,
    );
    expect(lastFrame()).toContain('▸');
    expect(lastFrame()).toContain('Show raw payload');
  });

  it('shows expanded state when isExpanded is true', () => {
    const {lastFrame} = render(
      <RawPayloadDetails
        rawToolName="mcp__server__action"
        payload={{key: 'value'}}
        isExpanded={true}
      />,
    );
    expect(lastFrame()).toContain('▾');
    expect(lastFrame()).toContain('Hide raw payload');
  });

  it('displays raw tool name when expanded', () => {
    const {lastFrame} = render(
      <RawPayloadDetails
        rawToolName="mcp__agent-web-interface__navigate"
        payload={{}}
        isExpanded={true}
      />,
    );
    expect(lastFrame()).toContain('mcp__agent-web-interface__navigate');
  });

  it('displays JSON payload when expanded', () => {
    const {lastFrame} = render(
      <RawPayloadDetails
        rawToolName="Bash"
        payload={{command: 'ls -la'}}
        isExpanded={true}
      />,
    );
    expect(lastFrame()).toContain('ls -la');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/components/RawPayloadDetails.test.tsx`
Expected: FAIL - module not found

### Step 3: Implement RawPayloadDetails component

```typescript
// source/components/RawPayloadDetails.tsx
import React from 'react';
import {Box, Text} from 'ink';

type Props = {
  rawToolName: string;
  payload: Record<string, unknown>;
  isExpanded: boolean;
};

export default function RawPayloadDetails({
  rawToolName,
  payload,
  isExpanded,
}: Props) {
  if (!isExpanded) {
    return (
      <Box marginTop={1}>
        <Text dimColor>▸ Show raw payload (press i)</Text>
      </Box>
    );
  }

  const jsonStr = JSON.stringify(payload, null, 2);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>▾ Hide raw payload (press i)</Text>
      <Box marginLeft={2} marginTop={1} flexDirection="column">
        <Text dimColor>Raw tool: {rawToolName}</Text>
        <Box marginTop={1}>
          <Text dimColor>{jsonStr}</Text>
        </Box>
      </Box>
    </Box>
  );
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/components/RawPayloadDetails.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add source/components/RawPayloadDetails.tsx source/components/RawPayloadDetails.test.tsx
git commit -m "$(cat <<'EOF'
feat(RawPayloadDetails): add collapsible raw payload component

Toggle between collapsed/expanded states to show full JSON payload
and raw tool identifier for debugging.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Create PermissionHeader Component

**Files:**

- Create: `source/components/PermissionHeader.tsx`
- Create: `source/components/PermissionHeader.test.tsx`

### Step 1: Write failing tests for PermissionHeader

```typescript
// source/components/PermissionHeader.test.tsx
import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import PermissionHeader from './PermissionHeader.js';

describe('PermissionHeader', () => {
  it('displays READ tier with cyan styling', () => {
    const {lastFrame} = render(<PermissionHeader tier="READ" queuedCount={0} />);
    expect(lastFrame()).toContain('ℹ');
    expect(lastFrame()).toContain('READ');
  });

  it('displays MODERATE tier with warning icon', () => {
    const {lastFrame} = render(<PermissionHeader tier="MODERATE" queuedCount={0} />);
    expect(lastFrame()).toContain('⚠');
    expect(lastFrame()).toContain('MODERATE');
  });

  it('displays WRITE tier', () => {
    const {lastFrame} = render(<PermissionHeader tier="WRITE" queuedCount={0} />);
    expect(lastFrame()).toContain('WRITE');
  });

  it('displays DESTRUCTIVE tier with stop icon', () => {
    const {lastFrame} = render(<PermissionHeader tier="DESTRUCTIVE" queuedCount={0} />);
    expect(lastFrame()).toContain('⛔');
    expect(lastFrame()).toContain('DESTRUCTIVE');
  });

  it('shows queue count when > 0', () => {
    const {lastFrame} = render(<PermissionHeader tier="MODERATE" queuedCount={3} />);
    expect(lastFrame()).toContain('3 more');
  });

  it('hides queue count when 0', () => {
    const {lastFrame} = render(<PermissionHeader tier="MODERATE" queuedCount={0} />);
    expect(lastFrame()).not.toContain('more');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/components/PermissionHeader.test.tsx`
Expected: FAIL - module not found

### Step 3: Implement PermissionHeader component

```typescript
// source/components/PermissionHeader.tsx
import React from 'react';
import {Box, Text} from 'ink';
import {type RiskTier, RISK_TIER_CONFIG} from '../services/riskTier.js';

type Props = {
  tier: RiskTier;
  queuedCount: number;
};

export default function PermissionHeader({tier, queuedCount}: Props) {
  const config = RISK_TIER_CONFIG[tier];

  return (
    <Box>
      <Text color={config.color}>
        {config.icon} Permission Required [{config.label}]
      </Text>
      {queuedCount > 0 && <Text dimColor> ({queuedCount} more queued)</Text>}
    </Box>
  );
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/components/PermissionHeader.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add source/components/PermissionHeader.tsx source/components/PermissionHeader.test.tsx
git commit -m "$(cat <<'EOF'
feat(PermissionHeader): add risk-aware header component

Display permission prompt header with tier-specific icon, color, and label.
Shows queued request count.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Create TypeToConfirm Component for Destructive Actions

**Files:**

- Create: `source/components/TypeToConfirm.tsx`
- Create: `source/components/TypeToConfirm.test.tsx`

### Step 1: Write failing tests for TypeToConfirm

```typescript
// source/components/TypeToConfirm.test.tsx
import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import TypeToConfirm from './TypeToConfirm.js';

describe('TypeToConfirm', () => {
  it('displays confirmation prompt', () => {
    const {lastFrame} = render(
      <TypeToConfirm
        confirmText="Bash"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain('Type');
    expect(lastFrame()).toContain('Bash');
    expect(lastFrame()).toContain('to allow');
  });

  it('shows hint for cancel', () => {
    const {lastFrame} = render(
      <TypeToConfirm
        confirmText="Bash"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain('Escape');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/components/TypeToConfirm.test.tsx`
Expected: FAIL - module not found

### Step 3: Implement TypeToConfirm component

```typescript
// source/components/TypeToConfirm.tsx
import React, {useState, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';

type Props = {
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function TypeToConfirm({
  confirmText,
  onConfirm,
  onCancel,
}: Props) {
  const [input, setInput] = useState('');

  useInput((inputChar, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (input.toLowerCase() === confirmText.toLowerCase() || input.toLowerCase() === 'yes') {
        onConfirm();
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    // Only accept printable characters
    if (inputChar && !key.ctrl && !key.meta) {
      setInput(prev => prev + inputChar);
    }
  });

  const isMatch = input.toLowerCase() === confirmText.toLowerCase() || input.toLowerCase() === 'yes';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="red" bold>
          ⛔ Type "{confirmText}" or "yes" to allow:
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>&gt; </Text>
        <Text color={isMatch ? 'green' : undefined}>{input}</Text>
        <Text dimColor>▌</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Escape to deny</Text>
      </Box>
    </Box>
  );
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/components/TypeToConfirm.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add source/components/TypeToConfirm.tsx source/components/TypeToConfirm.test.tsx
git commit -m "$(cat <<'EOF'
feat(TypeToConfirm): add type-to-confirm for destructive actions

Require explicit text confirmation for DESTRUCTIVE tier tools.
Accepts tool name or "yes" as confirmation.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Refactor PermissionDialog with New Components

**Files:**

- Modify: `source/components/PermissionDialog.tsx`
- Modify: `source/components/PermissionDialog.test.tsx`

### Step 1: Write failing tests for refactored PermissionDialog

```typescript
// Replace source/components/PermissionDialog.test.tsx
import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import PermissionDialog from './PermissionDialog.js';
import {type HookEventDisplay} from '../types/hooks/display.js';

function makePermissionEvent(
  toolName: string,
  toolInput: Record<string, unknown> = {},
): HookEventDisplay {
  return {
    id: 'test-id',
    requestId: 'req-123',
    timestamp: new Date('2025-01-01T12:00:00'),
    hookName: 'PreToolUse',
    toolName,
    payload: {
      session_id: 'sess-1',
      transcript_path: '/path',
      cwd: '/project',
      hook_event_name: 'PreToolUse' as const,
      tool_name: toolName,
      tool_input: toolInput,
    },
    status: 'pending',
  };
}

describe('PermissionDialog', () => {
  describe('header', () => {
    it('shows risk tier badge', () => {
      const event = makePermissionEvent('Bash');
      const {lastFrame} = render(
        <PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
      );
      expect(lastFrame()).toContain('DESTRUCTIVE');
    });

    it('shows WRITE tier for Edit', () => {
      const event = makePermissionEvent('Edit');
      const {lastFrame} = render(
        <PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
      );
      expect(lastFrame()).toContain('WRITE');
    });
  });

  describe('tool display', () => {
    it('shows parsed tool name for MCP tools', () => {
      const event = makePermissionEvent('mcp__agent-web-interface__click', {});
      const {lastFrame} = render(
        <PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('click');
      expect(frame).toContain('agent-web-interface');
    });

    it('shows built-in tool name directly', () => {
      const event = makePermissionEvent('Bash', {command: 'ls'});
      const {lastFrame} = render(
        <PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
      );
      expect(lastFrame()).toContain('Bash');
    });
  });

  describe('args display', () => {
    it('shows "(none)" for empty args', () => {
      const event = makePermissionEvent('Bash', {});
      const {lastFrame} = render(
        <PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
      );
      expect(lastFrame()).toContain('(none)');
    });

    it('shows formatted args', () => {
      const event = makePermissionEvent('Bash', {command: 'npm test'});
      const {lastFrame} = render(
        <PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
      );
      expect(lastFrame()).toContain('npm test');
    });
  });

  describe('keybinding bar', () => {
    it('shows keybinding hints', () => {
      const event = makePermissionEvent('Edit', {});
      const {lastFrame} = render(
        <PermissionDialog request={event} queuedCount={0} onDecision={vi.fn()} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('a');
      expect(frame).toContain('Allow');
      expect(frame).toContain('d');
      expect(frame).toContain('Deny');
    });
  });

  describe('queue count', () => {
    it('shows queue count when > 0', () => {
      const event = makePermissionEvent('Bash');
      const {lastFrame} = render(
        <PermissionDialog request={event} queuedCount={2} onDecision={vi.fn()} />,
      );
      expect(lastFrame()).toContain('2 more');
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: FAIL - new assertions fail

### Step 3: Refactor PermissionDialog component

```typescript
// source/components/PermissionDialog.tsx
import React, {useState, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {isToolEvent} from '../types/hooks/events.js';
import {type PermissionDecision} from '../types/server.js';
import {parseToolName, formatArgs} from '../utils/toolNameParser.js';
import {getRiskTier, RISK_TIER_CONFIG} from '../services/riskTier.js';
import PermissionHeader from './PermissionHeader.js';
import KeybindingBar from './KeybindingBar.js';
import RawPayloadDetails from './RawPayloadDetails.js';
import TypeToConfirm from './TypeToConfirm.js';

type Props = {
  request: HookEventDisplay;
  queuedCount: number;
  onDecision: (decision: PermissionDecision) => void;
};

export default function PermissionDialog({
  request,
  queuedCount,
  onDecision,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const rawToolName = request.toolName ?? 'Unknown';
  const parsed = parseToolName(rawToolName);
  const tier = getRiskTier(rawToolName);
  const tierConfig = RISK_TIER_CONFIG[tier];

  // Extract tool input
  let toolInput: Record<string, unknown> = {};
  if (isToolEvent(request.payload)) {
    toolInput = request.payload.tool_input;
  }

  const formattedArgs = formatArgs(toolInput);

  // Handle keyboard input for single-key decisions
  useInput((input, key) => {
    // Don't process if destructive (use TypeToConfirm instead)
    if (tierConfig.requiresConfirmation) return;

    if (input === 'a') {
      onDecision('allow');
    } else if (input === 'd' || key.return) {
      onDecision('deny');
    } else if (input === 'A') {
      onDecision('always-allow');
    } else if (input === 'D') {
      onDecision('always-deny');
    } else if (input === 'i' || input === '?') {
      setShowDetails(prev => !prev);
    }
  });

  const handleConfirm = useCallback(() => {
    onDecision('allow');
  }, [onDecision]);

  const handleCancel = useCallback(() => {
    onDecision('deny');
  }, [onDecision]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={tierConfig.color}
      paddingX={1}
    >
      <PermissionHeader tier={tier} queuedCount={queuedCount} />

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>Tool:    </Text>
          <Text bold>{parsed.displayName}</Text>
        </Box>
        {parsed.serverLabel && (
          <Box>
            <Text dimColor>Server:  </Text>
            <Text>{parsed.serverLabel}</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>Args:    </Text>
          <Text>{formattedArgs}</Text>
        </Box>
      </Box>

      <RawPayloadDetails
        rawToolName={rawToolName}
        payload={toolInput}
        isExpanded={showDetails}
      />

      {tierConfig.requiresConfirmation ? (
        <TypeToConfirm
          confirmText={parsed.displayName}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      ) : (
        <KeybindingBar
          toolName={parsed.displayName}
          serverLabel={parsed.serverLabel}
        />
      )}
    </Box>
  );
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add source/components/PermissionDialog.tsx source/components/PermissionDialog.test.tsx
git commit -m "$(cat <<'EOF'
refactor(PermissionDialog): integrate risk tiers and keyboard shortcuts

- Add risk tier badge and color-coded border
- Parse MCP tool names into friendly display
- Format args compactly with "(none)" for empty
- Add single-key activation (a/d/A/D)
- Add collapsible raw payload details
- Require type-to-confirm for DESTRUCTIVE tier

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Add Agent Chain Context Display

**Files:**

- Modify: `source/components/PermissionDialog.tsx`
- Modify: `source/components/PermissionDialog.test.tsx`
- Modify: `source/types/hooks/display.ts`

### Step 1: Write failing tests for agent chain context

```typescript
// Add to source/components/PermissionDialog.test.tsx
describe('agent chain', () => {
  it('shows agent chain when parentSubagentId is present', () => {
    const event = makePermissionEvent('Bash', {});
    event.parentSubagentId = 'agent-123';
    // Mock that we'd have agent info available
    const {lastFrame} = render(
      <PermissionDialog
        request={event}
        queuedCount={0}
        onDecision={vi.fn()}
        agentChain={['main', 'web-explorer']}
      />,
    );
    expect(lastFrame()).toContain('main');
    expect(lastFrame()).toContain('→');
    expect(lastFrame()).toContain('web-explorer');
  });

  it('does not show agent chain when not in subagent', () => {
    const event = makePermissionEvent('Bash', {});
    const {lastFrame} = render(
      <PermissionDialog
        request={event}
        queuedCount={0}
        onDecision={vi.fn()}
      />,
    );
    expect(lastFrame()).not.toContain('Agent chain');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: FAIL - agentChain prop doesn't exist

### Step 3: Add agent chain prop and display

```typescript
// Update Props type in source/components/PermissionDialog.tsx
type Props = {
  request: HookEventDisplay;
  queuedCount: number;
  onDecision: (decision: PermissionDecision) => void;
  agentChain?: string[];
};

// Add to component body, after the Args display
{agentChain && agentChain.length > 0 && (
  <Box>
    <Text dimColor>Context: </Text>
    <Text color="magenta">{agentChain.join(' → ')}</Text>
  </Box>
)}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: PASS

### Step 5: Commit

```bash
git add source/components/PermissionDialog.tsx source/components/PermissionDialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(PermissionDialog): add agent chain context display

Show the agent chain (e.g., "main → web-explorer") when permission
requests originate from subagents.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire Up Agent Chain in App

**Files:**

- Modify: `source/app.tsx`
- Modify: `source/hooks/useHookServer.ts`

### Step 1: Write failing test for agent chain extraction

```typescript
// Add to source/hooks/useHookServer.test.ts
describe('getAgentChain', () => {
	it('returns empty array for main agent', () => {
		const events: HookEventDisplay[] = [];
		expect(getAgentChain(events, undefined)).toEqual([]);
	});

	it('returns chain for nested subagent', () => {
		const events: HookEventDisplay[] = [
			{
				id: '1',
				requestId: 'r1',
				timestamp: new Date(),
				hookName: 'SubagentStart',
				payload: {
					hook_event_name: 'SubagentStart',
					agent_id: 'agent-1',
					agent_type: 'web-explorer',
					session_id: 's1',
					transcript_path: '/t',
					cwd: '/',
				},
				status: 'pending',
			},
		];
		expect(getAgentChain(events, 'agent-1')).toEqual(['main', 'web-explorer']);
	});
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/hooks/useHookServer.test.ts`
Expected: FAIL - getAgentChain not exported

### Step 3: Implement getAgentChain utility

```typescript
// Add to source/hooks/useHookServer.ts or create source/utils/agentChain.ts

/**
 * Build the agent chain from event history.
 * Returns array like ['main', 'web-explorer', 'playwright-writer']
 */
export function getAgentChain(
	events: HookEventDisplay[],
	parentSubagentId: string | undefined,
): string[] {
	if (!parentSubagentId) return [];

	const chain: string[] = ['main'];

	// Find the SubagentStart event for this parent
	const startEvent = events.find(
		e =>
			e.hookName === 'SubagentStart' &&
			(e.payload as {agent_id?: string}).agent_id === parentSubagentId,
	);

	if (startEvent) {
		const agentType = (startEvent.payload as {agent_type?: string}).agent_type;
		if (agentType) {
			chain.push(agentType);
		}
	}

	return chain;
}
```

### Step 4: Update app.tsx to pass agent chain

```typescript
// In app.tsx, compute agent chain for current permission request
const agentChain = currentPermissionRequest
  ? getAgentChain(events, currentPermissionRequest.parentSubagentId)
  : undefined;

// Update PermissionDialog render
{currentPermissionRequest && (
  <PermissionDialog
    request={currentPermissionRequest}
    queuedCount={permissionQueueCount - 1}
    onDecision={handlePermissionDecision}
    agentChain={agentChain}
  />
)}
```

### Step 5: Run tests to verify they pass

Run: `npm test`
Expected: PASS

### Step 6: Commit

```bash
git add source/app.tsx source/hooks/useHookServer.ts source/utils/agentChain.ts
git commit -m "$(cat <<'EOF'
feat(app): wire up agent chain context to permission dialog

Extract agent chain from SubagentStart events and pass to
PermissionDialog for context display.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update Status Spinner for Permission State

**Files:**

- Modify: `source/app.tsx`

### Step 1: Write failing test for combined status

```typescript
// This would be tested via visual inspection or integration test
// The change is straightforward - just update the Spinner label
```

### Step 2: Update spinner in app.tsx

```typescript
// Replace the existing spinner section
{isClaudeRunning && !currentPermissionRequest && (
  <Box>
    <Spinner label="Agent is thinking..." />
  </Box>
)}

{isClaudeRunning && currentPermissionRequest && (
  <Box>
    <Spinner label="Agent paused — permission needed" />
  </Box>
)}
```

### Step 3: Run lint and tests

Run: `npm run lint && npm test`
Expected: PASS

### Step 4: Commit

```bash
git add source/app.tsx
git commit -m "$(cat <<'EOF'
feat(app): show combined status when permission needed

Display "Agent paused — permission needed" spinner when waiting
for permission decision instead of two separate status lines.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Add Confirmation Feedback on Decision

**Files:**

- Modify: `source/components/PermissionDialog.tsx`
- Modify: `source/app.tsx`

### Step 1: Write failing test for confirmation feedback

```typescript
// Add to PermissionDialog.test.tsx
describe('confirmation feedback', () => {
  it('calls onDecision with correct value for allow', () => {
    const onDecision = vi.fn();
    const event = makePermissionEvent('Edit', {});
    const {stdin} = render(
      <PermissionDialog request={event} queuedCount={0} onDecision={onDecision} />,
    );
    stdin.write('a');
    expect(onDecision).toHaveBeenCalledWith('allow');
  });

  it('calls onDecision with deny on Enter', () => {
    const onDecision = vi.fn();
    const event = makePermissionEvent('Edit', {});
    const {stdin} = render(
      <PermissionDialog request={event} queuedCount={0} onDecision={onDecision} />,
    );
    stdin.write('\r');
    expect(onDecision).toHaveBeenCalledWith('deny');
  });
});
```

### Step 2: Run test to verify behavior

Run: `npx vitest run source/components/PermissionDialog.test.tsx`
Expected: PASS (this tests the keyboard handling we already added)

### Step 3: Commit

```bash
git add source/components/PermissionDialog.test.tsx
git commit -m "$(cat <<'EOF'
test(PermissionDialog): add keyboard interaction tests

Verify single-key activation for allow/deny decisions.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Run Full Test Suite and Lint

**Files:**

- All modified files

### Step 1: Run linter

Run: `npm run lint`
Expected: PASS (fix any issues)

### Step 2: Run type check

Run: `npx tsc --noEmit`
Expected: PASS (fix any type errors)

### Step 3: Run full test suite

Run: `npm test`
Expected: All tests pass

### Step 4: Build project

Run: `npm run build`
Expected: Build succeeds

### Step 5: Manual smoke test

Run: `npm run start`
Test: Trigger a permission prompt and verify:

- Risk tier badge displays correctly
- Tool name is parsed (not raw MCP identifier)
- Args show "(none)" when empty
- Keybindings work (a/d/A/D/i)
- Border color matches tier

### Step 6: Final commit if any fixes needed

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: fix lint/type issues from permission prompt refactor

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Summary of Changes

| File                                      | Change Type | Description                                                 |
| ----------------------------------------- | ----------- | ----------------------------------------------------------- |
| `source/utils/toolNameParser.ts`          | Modified    | Added `serverLabel` to ParsedToolName, added `formatArgs()` |
| `source/services/riskTier.ts`             | Created     | Risk tier classification system                             |
| `source/components/PermissionHeader.tsx`  | Created     | Risk-aware header with tier badge                           |
| `source/components/KeybindingBar.tsx`     | Created     | Keyboard shortcut display                                   |
| `source/components/RawPayloadDetails.tsx` | Created     | Collapsible raw payload toggle                              |
| `source/components/TypeToConfirm.tsx`     | Created     | Type-to-confirm for destructive actions                     |
| `source/components/PermissionDialog.tsx`  | Modified    | Refactored to use new components                            |
| `source/app.tsx`                          | Modified    | Added agent chain, updated spinner                          |

---

## Out of Scope (Future Work)

- Auto-allow for READ tier (requires changes to useHookServer handlers)
- Skill name extraction from payload (requires parsing skill arg)
- Persistent "always" rules across sessions (requires file storage)
- Agent task description in Context field (requires protocol changes)

---

**Plan complete and saved to `docs/plans/2026-02-05-permission-prompt-ux.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
