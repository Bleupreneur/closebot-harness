#!/usr/bin/env bash
# Stop hook. If any skill ran this turn, block the stop once and instruct the
# model to spawn the background self-healing review (skill-retro) before ending.
# OPT-IN: does nothing unless CB_SELF_HEAL=1 is set (env, or the harness .env:
# ./.env in folder mode, ~/.config/closebot/.env in plugin mode) — the review
# spawns a background agent that edits skill/script files, which costs tokens.
# Loop-safe: clears the marker and honors stop_hook_active so it fires at most
# once per turn. Exits 0 silently when jq is missing.
set -uo pipefail
command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // "default"' 2>/dev/null || echo default)
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  # Plugin mode: never read the user's project .env; the harness config lives in the user dir.
  envfile="${CLOSEBOT_CONFIG_DIR:-${HOME:-}/.config/closebot}/.env"
  dir="${CLAUDE_PLUGIN_DATA:-${TMPDIR:-/tmp}/closebot-harness}"
  retro="the closebot-harness:skill-retro skill"
  cb="cb"
else
  root="${CLAUDE_PROJECT_DIR:-$PWD}"
  envfile="$root/.env"
  dir="$root/.claude"
  retro="the skill-retro skill at skills/skill-retro/SKILL.md"
  cb="cli/cb"
fi
mark="$dir/.skills-used-$sid"

# Opt-in gate. The harness .env may set CB_SELF_HEAL=1 without exporting it.
if [ "${CB_SELF_HEAL:-}" != "1" ] && [ -f "$envfile" ]; then
  CB_SELF_HEAL=$(sed -n 's/^CB_SELF_HEAL=["]*\([0-9]*\).*/\1/p' "$envfile" | tail -1)
fi
if [ "${CB_SELF_HEAL:-}" != "1" ]; then
  rm -f "$mark"
  exit 0
fi

# Already in a stop-hook continuation, or nothing recorded -> allow stop.
if [ "$active" = "true" ] || [ ! -s "$mark" ]; then
  rm -f "$mark"
  exit 0
fi

skills=$(sort -u "$mark" | tr '\n' ' ' | sed 's/ *$//')
rm -f "$mark"

reason="SELF-HEALING SKILL LOOP — skills used this turn: ${skills}. Before you stop, spawn exactly ONE background agent (Agent tool, run_in_background:true) following ${retro}. It must: (1) judge whether a faster/more-appropriate skill should have been used, (2) check whether each used skill or its script needs updating for speed/correctness, (3) apply only safe, evidence-grounded improvements directly to the skill/script files, and (4) record every new gotcha with: ${cb} gotcha add --skill <name> --symptom \"...\" --cause \"...\" --fix \"...\" (never edit GOTCHAS.md by hand; no duplicates). Spawn it, then stop — do not wait for it."

jq -cn --arg r "$reason" '{decision:"block", reason:$r}'
exit 0
