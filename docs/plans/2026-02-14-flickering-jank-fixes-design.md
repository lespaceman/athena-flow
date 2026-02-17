# Flickering & Jank Fixes — Design

## Problem

The Ink terminal UI suffers from multiple sources of visual instability:

1. Terminal-level frame tearing during rapid re-renders
2. High-frequency re-renders from spinners/timers/pulse effects
3. Layout shifts when permission/question dialogs mount/unmount
4. Brief visual gap when items transition from dynamic to `<Static>` rendering

## Approach: Layered Fixes

Four independent layers, each addressing a different source of jank.

### Layer 1: Upgrade Ink to ≥6.7.0

Ink v6.7.0 added synchronized terminal updates — output is wrapped in DCS sequences so the terminal buffers changes and paints atomically. This eliminates frame-tearing flicker at the framework level.

- Bump `ink` in `package.json` to `^6.7.0`
- Zero code changes, version bump only
- Run full test suite to verify compatibility

### Layer 2: Reduce Re-render Frequency

Three timers cause independent re-renders:

| Timer                          | Current         | Change                                     |
| ------------------------------ | --------------- | ------------------------------------------ |
| `useSpinner`                   | 80ms (12.5 FPS) | Slow to 120ms (8.3 FPS)                    |
| Pulse (`UnifiedToolCallEvent`) | 500ms           | Remove entirely — use static pending color |
| `useDuration`                  | 1000ms          | Keep as-is                                 |

Files: `source/hooks/useSpinner.ts`, `source/components/UnifiedToolCallEvent.tsx`

### Layer 3: Stabilize Dialog Transitions

Currently `app.tsx` conditionally renders either a dialog OR CommandInput. This causes the live region height to jump.

Fix: Always render CommandInput (it already has `disabled` prop). Render dialogs _above_ it instead of _instead of_ it. This keeps the bottom of the screen stable.

File: `source/app.tsx`

### Layer 4: Guard Dynamic→Static Transition

When items transition from dynamic to stable, they briefly disappear from dynamic before appearing in `<Static>`.

Fix: Track "ready to promote" state with a ref — only promote items to stable after they've been in their final state for at least one render cycle.

File: `source/hooks/useContentOrdering.ts`

## Success Criteria

- No visible frame tearing during tool execution
- No layout jumps when dialogs appear/disappear
- Smooth spinner animation with fewer re-renders
- All existing tests pass
