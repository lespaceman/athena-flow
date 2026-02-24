# tsup Build Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace plain `tsc` with tsup (esbuild) as the production bundler, reducing ~421 output files to ~4.

**Architecture:** tsup bundles two entry points (cli.tsx, hook-forwarder.ts) into ESM with code splitting. Native deps (better-sqlite3) and Ink runtime (ink, react, @inkjs/ui) are externalized. tsc retained for typechecking only.

**Tech Stack:** tsup, esbuild, TypeScript

---

### Task 1: Install tsup

**Files:**
- Modify: `package.json`

**Step 1: Install tsup as devDependency**

Run: `npm install -D tsup`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install tsup"
```

---

### Task 2: Create tsup config

**Files:**
- Create: `tsup.config.ts`

**Step 1: Create tsup.config.ts**

```ts
import {defineConfig} from 'tsup';

export default defineConfig({
	entry: ['source/cli.tsx', 'source/hook-forwarder.ts'],
	format: ['esm'],
	target: 'node18',
	outDir: 'dist',
	clean: true,
	splitting: true,
	sourcemap: true,
	dts: true,
	banner: {
		js: '#!/usr/bin/env node',
	},
	external: [
		'better-sqlite3',
		'ink',
		'react',
		'@inkjs/ui',
		'react-devtools-core',
	],
});
```

> **Why these externals:**
> - `better-sqlite3`: Native C++ addon — cannot be bundled
> - `ink`, `react`, `@inkjs/ui`: Ink requires a singleton React instance; bundling duplicates it and breaks rendering
> - `react-devtools-core`: Optional peer dep of Ink, conditionally imported

**Step 2: Run initial build to test**

Run: `npx tsup`
Expected: Build succeeds, outputs `dist/cli.js`, `dist/hook-forwarder.js`, possibly chunk files, and `.d.ts` files.

**Step 3: Verify both entry points run**

Run: `node dist/cli.js --help`
Expected: Shows help text (same as before).

Run: `echo '{}' | node dist/hook-forwarder.js`
Expected: Exits (may error on missing fields, but shouldn't crash on module resolution).

**Step 4: Commit**

```bash
git add tsup.config.ts
git commit -m "feat: add tsup build configuration"
```

---

### Task 3: Fix package.json require

**Files:**
- Modify: `source/cli.tsx:25-26`

**Context:** `cli.tsx` currently does:
```ts
const require = createRequire(import.meta.url);
const {version} = require('../package.json') as {version: string};
```

With tsup, `import.meta.url` points to the bundled file in `dist/`, so `../package.json` still resolves correctly (dist/ is one level deep from project root). However, `createRequire` + `require()` is an anti-pattern for bundlers.

**Step 1: Check if the require works with tsup output**

Run: `npx tsup && node dist/cli.js --help`

If it works: skip this task (the relative path `../package.json` resolves from `dist/` → project root, which is correct).

If it fails: Replace with a direct fs read:

```ts
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {version} = JSON.parse(
	readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
) as {version: string};
```

**Step 2: Commit (if changed)**

```bash
git add source/cli.tsx
git commit -m "fix: make package.json version read compatible with tsup bundle"
```

---

### Task 4: Update package.json scripts

**Files:**
- Modify: `package.json`

**Step 1: Update scripts**

Change these scripts in `package.json`:

```json
{
	"scripts": {
		"build": "tsup",
		"typecheck": "tsc --noEmit",
		"dev": "tsup --watch",
		"start": "tsup && node dist/cli.js",
		"dev:debug": "tsup && DEV=true node dist/cli.js",
		"prepublishOnly": "npm run lint && npm run typecheck && npm test && npm run build"
	}
}
```

Remove the `"clean"` script (tsup has `clean: true` built in).

Keep all other scripts unchanged (`test`, `test:watch`, `lint`, `format`, `devtools`).

**Step 2: Simplify `files` field**

Since tsup with `clean: true` won't leave stale test files, simplify:

```json
{
	"files": [
		"dist",
		"!dist/**/*.js.map",
		"!dist/**/*.d.ts.map"
	]
}
```

The test/sentinel exclusions are no longer needed — tsup only outputs entry points + chunks.

**Step 3: Verify full pipeline**

Run: `npm run lint`
Expected: Pass

Run: `npm run typecheck`
Expected: Pass

Run: `npm test`
Expected: Pass (vitest is unaffected by build tool change)

Run: `npm run build`
Expected: tsup builds successfully

Run: `npm pack --dry-run 2>&1 | tail -15`
Expected: Small number of files (cli.js, hook-forwarder.js, chunks, .d.ts), no sourcemaps, no test files.

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: switch build scripts from tsc to tsup"
```

---

### Task 5: Update tsconfig for typecheck-only

**Files:**
- Modify: `tsconfig.json`

**Step 1: Remove output-related options**

Since tsc is now typecheck-only, remove options that only matter for emit:

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"jsx": "react-jsx",
		"strict": true,
		"esModuleInterop": true,
		"skipLibCheck": true,
		"noEmit": true,
		"forceConsistentCasingInFileNames": true,
		"resolveJsonModule": true,
		"isolatedModules": true
	},
	"include": ["source"],
	"exclude": ["source/**/*.test.ts"]
}
```

Removed: `outDir`, `rootDir`, `declaration`, `declarationMap`, `sourceMap` (all emit-related).
Added: `noEmit: true`.

**Step 2: Verify typecheck still works**

Run: `tsc --noEmit`
Expected: No errors (same as before)

**Step 3: Verify build still works**

Run: `npm run build`
Expected: tsup builds successfully (tsup ignores tsconfig emit options anyway, but verify nothing broke)

**Step 4: Commit**

```bash
git add tsconfig.json
git commit -m "refactor: make tsconfig typecheck-only (tsup handles emit)"
```

---

### Task 6: Update CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Update typecheck step**

In `.github/workflows/ci.yml`, change:
```yaml
      - name: Typecheck
        run: npx tsc --noEmit
```
to:
```yaml
      - name: Typecheck
        run: npm run typecheck
```

This uses our new script instead of calling tsc directly.

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: use npm run typecheck instead of direct tsc call"
```

---

### Task 7: Verify end-to-end

**Step 1: Clean build from scratch**

Run: `rm -rf dist && npm run build`
Expected: tsup creates dist/ with bundled output.

**Step 2: Local install test**

Run: `npm pack && npm install -g ./athena-flow-0.1.0.tgz`
Expected: Installs successfully.

Run: `athena-cli --help`
Expected: Shows help output.

Run: `npm uninstall -g athena-flow && rm athena-flow-0.1.0.tgz`

**Step 3: Verify package size improvement**

Run: `npm pack --dry-run 2>&1 | grep 'package size'`
Expected: Significantly smaller than the previous 177.7 kB.

**Step 4: Commit (if any fixes)**

```bash
git commit -m "chore: tsup build verification fixes"
```
