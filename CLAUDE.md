# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

athena-cli is a terminal-based CLI application built with Ink (React for CLIs) and TypeScript. It acts as a companion UI that intercepts Claude Code hook events via Unix Domain Sockets.

## Commands

```bash
# Build
npm run build          # Compile TypeScript to dist/

# Development
npm run dev            # Watch mode compilation
npm run start          # Build and run CLI

# Test & Lint
npm test               # Run vitest tests
npm run test:watch     # Run tests in watch mode
npm run lint           # Run prettier + eslint
npm run format         # Auto-format with prettier

# Run single test
npx vitest run source/types/hooks.test.ts
```

## Architecture

### Two Entry Points

1. **dist/cli.js** (`athena-cli`) - Main Ink terminal UI
   - Parses CLI args with meow (`source/cli.tsx`)
   - Renders React app with Ink (`source/app.tsx`)
   - Starts UDS server to receive hook events (`source/hooks/useHookServer.ts`)

2. **dist/hook-forwarder.js** (`athena-hook-forwarder`) - Standalone script invoked by Claude Code hooks
   - Reads hook input JSON from stdin
   - Connects to Ink CLI via Unix Domain Socket at `{projectDir}/.claude/run/ink.sock`
   - Forwards events using NDJSON protocol (`source/types/hooks.ts`)
   - Returns results via stdout/exit code

### Hook Flow

```
Claude Code → hook-forwarder (stdin JSON) → UDS → Ink CLI → UDS → hook-forwarder (stdout/exit code) → Claude Code
```

### Key Files

- **source/hooks/useHookServer.ts**: React hook managing the UDS server; handles auto-passthrough timeout (250ms)
- **source/context/HookContext.tsx**: React context providing hook server state to components
- **source/types/hooks.ts**: Protocol types, validation, and helper functions for hook communication
- **source/components/HookEvent.tsx**: Renders individual hook events in the terminal

## Tech Stack

- **Ink + React 19**: Terminal UI rendering
- **meow**: CLI argument parsing
- **vitest**: Test runner
- **eslint + prettier**: Linting and formatting (@vdemedes/prettier-config)
- **ink-testing-library**: Component testing

## Code Style

- ESM modules (`"type": "module"`)
- Prettier formatting via @vdemedes/prettier-config
- React function components with hooks
