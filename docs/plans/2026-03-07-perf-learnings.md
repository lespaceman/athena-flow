# 2026-03-07 Perf Learnings

## Biggest win

The biggest win was reducing repaint amplification rather than optimizing compute.

The key changes were:

- Anchor feed navigation so arrow keys stop re-centering the viewport on every move.
- Delay and batch static scrollback promotion so offscreen stability changes do not immediately scroll the terminal.
- Remove cosmetic timer churn from the normal feed path.
- Reuse derived UI data when rendered values are unchanged.

In practice, this changed the app from "small logical delta rewrites a large frame" to "visible movement drives most of the paint".

## Measured impact

Representative laptop-sized traces showed:

- `feed:tool.post` dropping from roughly `145-180ms` average total with `29-38KB` writes to about `60.4ms` total and `14.0KB` writes.
- `feed:decision` dropping to about `29.0ms` average total and `6.5KB` writes.
- `input:ArrowUp` dropping from the old `100ms+` range to about `19.6ms` average total.
- `input:ArrowDown` dropping to about `19.7ms` average total.
- Background timer churn removed from the normal path, with only smaller focused-spinner cost remaining.

Recent larger-monitor traces showed those gains were real but not architecture-proof:

- `feed:tool.post` regressed back into roughly `138-197ms` average total with `25-29KB` writes when the terminal area increased.
- `feed:decision` regressed into roughly `61-90ms` average total with `10-13KB` writes on the larger screen.
- `input:ArrowUp` and `input:ArrowDown` climbed back into roughly `68-132ms` average total on the larger screen.
- Slash-command entry, tab, and delete also became much more expensive on the larger screen because the app was still writing substantially more text per commit.

The practical takeaway is:

- the fixes materially improved the current renderer
- the remaining bottleneck still scales with terminal size
- the architecture is still paint-bound even after the churn reductions

## What mattered

### Paint was the bottleneck

The traces consistently showed tiny compute time and large Ink/stdout cost. The main problem was not JS work. The main problem was how much terminal output each logical update caused.

This remained true even after the app-level fixes. On larger terminals, the same interactions became much slower primarily because `bytes_written` and paint time scaled up with the screen area.

### Commit count was not enough

A cycle with modest React work could still be slow if it forced a large terminal rewrite. Bytes written and changed-row counts were often more useful than compute time.

Later traces reinforced this. Some of the worst user-perceived stalls were not the cycles with the most compute, but the ones that rewrote `20-60KB+` or more of terminal output for very small visible deltas.

### Offscreen rows still mattered

Promoting newly-stable rows into static scrollback during `tool.post` patching caused large writes even when visible row deltas were zero or tiny.

Batching static promotion helped a lot on laptop-sized runs, but the larger-monitor traces showed that offscreen and full-width repaint work can still dominate once the terminal gets bigger.

### Viewport policy was a real performance feature

Re-centering the viewport on every arrow key was expensive. Keeping the viewport anchored until the cursor leaves the visible window was one of the highest-leverage fixes.

This was one of the main reasons arrow-key navigation improved so much in the better runs. It reduced "small movement causes large viewport diff" behavior.

### Cosmetic timers were dangerous

Spinner and todo elapsed updates looked harmless in code, but they triggered expensive frame repaints unless they were tightly gated.

### Structural sharing helped

Returning the same arrays and objects when rendered values did not change prevented unrelated subtrees from repainting during feed traffic.

This helped keep the todo/body-prefix path from participating in feed updates unnecessarily, but it did not fully solve the large-screen scaling issue.

### Terminal size is now a first-class perf variable

The later comparison between laptop-sized and larger-monitor runs made this explicit:

- the same app logic could look close to healthy on the smaller screen
- then become obviously slow again on the larger screen

That means the current rendering model still scales too much with terminal area. The app is no longer just suffering from accidental churn; it is now hitting the ceiling of the current full-frame Ink-style rendering approach.

### Sample size and interaction mix matter

Some traces were not representative because they did not exercise `tool.post` at all, or only captured a handful of navigation events. A fast-looking trace with no `tool.post` cycles is not evidence that the feed path is solved.

## Remaining caveats

- Some outlier cycles still showed very large `stdout_write_ms` with `commits=0`. Those look more like blocking or write-attribution noise than the steady-state render path.
- `tool.post` and command-mode interactions can still be expensive in some runs, just much less catastrophically than before.
- Focused todo/spinner updates still cost something when intentionally enabled.
- Large terminals still expose major regressions because output volume scales with the rendered frame size.
- The latest follow-up traces suggest the remaining ceiling is architectural, not a small hook-level bug.

## Where this leaves the renderer

The app-level fixes were worth doing and clearly reduced waste. They also clarified the next boundary:

- further small hook optimizations may still help at the margins
- but large-monitor behavior suggests the main shell is still too dependent on full-frame or full-row repaint behavior

At this point, the most credible next step is a more Bubble Tea-like rendering model:

- region-based invalidation
- a screen buffer or surface model
- tighter control over what gets redrawn
- less dependence on terminal area for each commit

## Working rules for future perf work

When perf regresses again, check these first:

1. Does a small logical change still produce large `bytes_written`?
2. Did visible row changes actually increase, or did offscreen/static content move?
3. Did a timer or effect reintroduce background commits?
4. Did a hook start returning fresh arrays or objects on every render?
5. Did viewport movement or static feed promotion get more eager?
6. Did the terminal size change enough to expose frame-area scaling?
7. Does the trace actually include `tool.post` and representative navigation, or is it a misleading small sample?

## Files that carried the main fixes

- `src/ui/hooks/useFeedNavigation.ts`
- `src/ui/hooks/useStaticFeed.ts`
- `src/app/shell/AppShell.tsx`
- `src/ui/hooks/useTodoDisplayItems.ts`
- `src/ui/hooks/useTodoPanel.ts`
