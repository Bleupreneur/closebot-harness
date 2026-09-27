#!/usr/bin/env bash
# PostToolUse hook (matcher: Skill). Records which skill ran this turn so the
# Stop hook can fire the self-healing review. Reads the hook JSON on stdin.
# Never blocks; always exits 0. Folder mode: .claude/settings.json. Plugin mode:
# hooks/hooks.json, where only this plugin's skills (closebot-harness:*) count and
# markers go to $CLAUDE_PLUGIN_DATA instead of the user's project.
set -uo pipefail
command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // "default"' 2>/dev/null || echo default)
skill=$(printf '%s' "$input" | jq -r '.tool_input.skill // empty' 2>/dev/null || true)
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  case "${skill:-}" in closebot-harness:*) ;; *) exit 0 ;; esac
  dir="${CLAUDE_PLUGIN_DATA:-${TMPDIR:-/tmp}/closebot-harness}"
else
  dir="${CLAUDE_PROJECT_DIR:-$PWD}/.claude"
fi
mkdir -p "$dir" 2>/dev/null || exit 0
[ -n "${skill:-}" ] && printf '%s\n' "$skill" >> "$dir/.skills-used-$sid"
exit 0
