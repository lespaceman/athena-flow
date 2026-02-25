# tsup Build Setup Design

**Date**: 2026-02-25
**Status**: Approved

## Overview

Replace plain `tsc` with tsup (esbuild) as the production build tool. Keep tsc for typechecking only.

## Configuration

**Entry points**: `source/cli.tsx`, `source/hook-forwarder.ts`

**Format**: ESM only (`"type": "module"`)

**Target**: `node18`

**Features**: code splitting, declarations (dts), sourcemaps, clean

**Externals** (not bundled):

- `better-sqlite3` — native C++ addon
- `ink`, `react`, `@inkjs/ui` — Ink singleton must not be duplicated

**Bundled** (inlined): `meow`, `marked`, `marked-terminal`, `cli-highlight`, all internal modules

**Shebangs**: Applied via `banner: { js: '#!/usr/bin/env node' }` globally

## Script Changes

| Script           | Before                           | After                                |
| ---------------- | -------------------------------- | ------------------------------------ |
| `build`          | `tsc`                            | `tsup`                               |
| `typecheck`      | (new)                            | `tsc --noEmit`                       |
| `dev`            | `tsc --watch`                    | `tsup --watch`                       |
| `prepublishOnly` | `lint && test && clean && build` | `lint && typecheck && test && build` |

## Output

Before: ~421 files mirroring source directory
After: ~4 files (cli.js, hook-forwarder.js, shared chunks) + .d.ts declarations

## Unchanged

- `tsconfig.json` — kept for IDE + `tsc --noEmit`
- vitest — uses its own transform
- `.npmignore` / `files` — still exclude sourcemaps
