---
name: external-config-gate-patches
description: "Human gates that touch files OUTSIDE the repo (another tool's config, sibling repos): generate preview patches with stable path headers, not scratchpad paths."
tools: []
user-invocable: false
origin: auto-extracted
---

# External-Repo Gate Patches: Stable Headers Only

**Extracted:** 2026-09-05
**Context:** A multi-step plan whose human gate edited files that live
outside this git repo (another agent runtime's config file and a sibling
repo's routing file). The human-gate artifact was a `diff -u` preview saved
as `<target>-proposed.patch` next to the plan.

## Problem

The preview diff was built as `diff -u <real-path> <scratchpad-copy>`,
which embeds the scratchpad copy's absolute path as the `+++` header. The
scratchpad directory is session-scoped (a per-session temp dir) and is gone
by the next session. When a later session re-validated the gate with
`patch -p0 --dry-run -N < <target>-proposed.patch`, it still applied
cleanly — but only because GNU patch falls back to the `---` path when the
`+++` path doesn't exist on disk. That fallback is real but undocumented
behavior to depend on, not a guarantee: if a *different* file had ever
existed at that stale scratchpad path (e.g., a same-session-id collision,
or someone re-running the exact plan in the same scratchpad), `patch` could
silently target the wrong file instead of erroring.

## Fix

When generating a preview patch for a file that lives outside the repo:

1. Diff against a **stable pair of labels**, not the scratchpad copy's real
   path: `diff -u ~/.config/<tool>/config.yaml /tmp/x -L ~/.config/<tool>/config.yaml -L ~/.config/<tool>/config.yaml.new`
   (or equivalent `-L`/`--label` flags) so both headers name the real
   target, never a throwaway temp path.
2. Immediately after generating the patch, verify it with
   `patch -p0 --dry-run -N < the.patch` **in the same session** — don't
   defer verification to a future session where the scratchpad is gone and
   the fallback becomes load-bearing.
3. If a later session inherits a gate patch it didn't generate, re-run the
   dry-run *and* spot-check that the `+++`/`---` headers both resolve to
   files that plausibly belong to this plan before trusting a "applied
   cleanly" result.

## When to use

Any plan (or manual multi-step task) with a human gate whose target file
lives outside the current repo — another tool's config under `~/`, a
sibling repo, or any other absolute path not under version control here.
