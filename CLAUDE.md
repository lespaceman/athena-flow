# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

athena-cli is a terminal-based CLI application built with Ink (React for CLIs) and TypeScript. It uses create-ink-app as the project scaffold.

## Commands

```bash
# Build
npm run build          # Compile TypeScript to dist/

# Development
npm run dev            # Watch mode compilation

# Test (runs prettier, xo linter, and ava tests)
npm test

# Run single test
npx ava test.tsx       # Run specific test file
```

## Architecture

- **source/cli.tsx**: Entry point - parses CLI args with meow, renders React app with Ink
- **source/app.tsx**: Main React component rendered in the terminal
- **test.tsx**: Tests using ava and ink-testing-library
- **dist/**: Compiled output (bin entry point: dist/cli.js)

## Tech Stack

- **Ink**: React renderer for terminal UIs
- **meow**: CLI argument parsing
- **xo**: Linter (extends xo-react, uses Prettier)
- **ava**: Test runner
- **ink-testing-library**: Component testing

## Code Style

- ESM modules (`"type": "module"`)
- Prettier formatting via @vdemedes/prettier-config
- XO linting with React rules (react/prop-types disabled)
