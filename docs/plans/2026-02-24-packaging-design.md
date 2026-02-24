# athena-cli Packaging & Distribution Design

**Date**: 2026-02-24
**Status**: Approved

## Overview

Package athena-cli for npm public registry distribution with conventional-commit-based semantic versioning via release-please and GitHub Actions CI/CD.

## Decisions

| Decision    | Choice                                | Rationale                                                      |
| ----------- | ------------------------------------- | -------------------------------------------------------------- |
| Registry    | npm public (unscoped)                 | Widest reach, standard for CLI tools                           |
| Versioning  | Conventional Commits + release-please | Auto version bumps with manual release gate (merge Release PR) |
| Native deps | Postinstall rebuild                   | Standard npm approach; users compile better-sqlite3 on install |
| Bundling    | None (tsc only)                       | CLI tool, deps resolve via npm, native dep can't be bundled    |

## Package Identity

- **Name**: `athena-flow` (npm; `athena` was taken)
- **Binaries**: `athena-cli`, `athena-hook-forwarder`
- **Node**: `>=18`
- **License**: MIT
- **Files**: `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`

## Build Pipeline

No bundler — `tsc` compiles `source/` to `dist/`. Add `prepublishOnly` script:

```json
"prepublishOnly": "npm run lint && npm test && npm run build"
```

## Versioning (release-please)

1. Commit with conventional messages (`feat:`, `fix:`, `chore:`)
2. GitHub Action runs release-please on push to `main`
3. release-please creates/updates a Release PR (bumps `package.json` version + `CHANGELOG.md`)
4. Merge Release PR when ready to release
5. Merge triggers `npm publish`

Version mapping:

- `fix:` → patch (0.1.0 → 0.1.1)
- `feat:` → minor (0.1.0 → 0.2.0)
- `feat!:` / `BREAKING CHANGE:` → major (0.1.0 → 1.0.0)

## CI/CD (GitHub Actions)

### `ci.yml` — every PR + push to main

- Lint (`npm run lint`)
- Typecheck (`tsc --noEmit`)
- Test (`npm test`)
- Build (`npm run build`)

### `release.yml` — push to main

- Run release-please action
- If release created: `npm publish` using `NPM_TOKEN` secret

## Package Hygiene

- Add `repository`, `description`, `keywords`, `homepage`, `bugs` to `package.json`
- Verify `dist/cli.js` has `#!/usr/bin/env node` shebang
- `files: ["dist"]` already restricts published contents — exclude sourcemaps (`.js.map`, `.d.ts.map`) via `.npmignore`
- Add `prepublishOnly` guard script
