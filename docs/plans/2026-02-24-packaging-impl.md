# athena-cli Packaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up npm publishing pipeline with conventional commits, release-please, and GitHub Actions CI/CD.

**Architecture:** GitHub Actions for CI (lint/test/build on PRs) and release (release-please creates version-bump PRs, merging triggers npm publish). No bundler — tsc only.

**Tech Stack:** GitHub Actions, release-please, npm registry

---

### Task 1: Package.json Hygiene

**Files:**
- Modify: `package.json`

**Step 1: Add metadata and prepublishOnly script**

Add these fields to `package.json`:

```json
{
  "description": "Terminal companion UI for Claude Code — intercepts hook events and renders a rich dashboard",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/lespaceman/athena-cli.git"
  },
  "homepage": "https://github.com/lespaceman/athena-cli#readme",
  "bugs": {
    "url": "https://github.com/lespaceman/athena-cli/issues"
  },
  "keywords": ["cli", "claude", "terminal", "ink", "hooks", "dashboard"]
}
```

Add to `scripts`:

```json
"prepublishOnly": "npm run lint && npm test && npm run build"
```

**Step 2: Verify package contents**

Run: `npm pack --dry-run`
Expected: Only `dist/` files, `package.json`, `README.md`, `LICENSE` listed. No `source/`, no test files, no `node_modules/`.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add npm metadata and prepublishOnly guard"
```

---

### Task 2: Release-please Configuration

**Files:**
- Create: `.release-please-manifest.json`
- Create: `release-please-config.json`

**Step 1: Create release-please manifest**

`.release-please-manifest.json` — tracks current version:

```json
{
  ".": "0.1.0"
}
```

**Step 2: Create release-please config**

`release-please-config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "packages": {
    ".": {
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": true
    }
  }
}
```

> `bump-minor-pre-major` and `bump-patch-for-minor-pre-major` mean that while version is `0.x.y`, `feat:` bumps patch (not minor) and breaking changes bump minor (not major). This prevents accidental 1.0.0 releases.

**Step 3: Commit**

```bash
git add .release-please-manifest.json release-please-config.json
git commit -m "chore: add release-please configuration"
```

---

### Task 3: CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow for lint, typecheck, test, and build"
```

---

### Task 4: Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create release workflow**

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

  publish:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

> **Note:** You must add the `NPM_TOKEN` secret to GitHub repo settings (Settings → Secrets → Actions). Generate it on npmjs.com → Access Tokens → Automation token.

**Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow with release-please and npm publish"
```

---

### Task 5: Verify End-to-End Locally

**Step 1: Validate conventional commit parsing**

Run: `git log --oneline -10`
Verify recent commits use conventional format (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`, `refactor:`).

**Step 2: Test npm pack**

Run: `npm pack --dry-run`
Verify output lists only expected files.

**Step 3: Test prepublishOnly**

Run: `npm run prepublishOnly`
Expected: lint, test, and build all pass.

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "chore: packaging fixes from local verification"
```

---

## Setup Checklist (post-merge)

After merging these changes to main:

1. **Create npm account** (if not already) at npmjs.com
2. **Generate automation token** on npmjs.com → Access Tokens
3. **Add `NPM_TOKEN` secret** to GitHub repo: Settings → Secrets and variables → Actions
4. Push to main — release-please will start tracking commits
5. When ready to release: merge the Release PR that release-please creates
