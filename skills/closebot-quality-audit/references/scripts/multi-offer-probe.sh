#!/usr/bin/env bash
# multi-offer-probe.sh — Run a multi-turn Path A testSession against a multi-offer CloseBot bot.
# Probes every offer surface systematically. Use after persona changes or multi-offer rebuilds.
#
# Usage:
#   bash multi-offer-probe.sh <bot_id> <run_dir> [timeout] [mimic_source_id]
#
# Args:
#   bot_id          — CloseBot bot ID (e.g. bot_XXXXXXXXXXXXXXXX)
#   run_dir         — output directory for transcripts + per-turn JSON
#   timeout         — reply poll timeout per turn in seconds (default: 15; use 25 for silent-stop probes)
#   mimic_source_id — optional. A testSession has NO source context by default
#                     ({{source.*}} renders empty, KB/library retrieval never fires) —
#                     pass the bot's real source id (`cb bot audit <id> --json | jq .sources`)
#                     to mimic it via `cb bottesting put-testsession` right after the session
#                     is created, so KB Accuracy grading reflects what a real lead would see.
#
# Requires: this repo's cli/cb (override root with $CLOSEBOT_DIR; reads the key from the repo .env — nothing to source), jq.
# Every call is `cli/cb`: one session is created up front (cb bottesting post-testsession),
# each turn runs `cb bot test --lead <leadId>` so the bot keeps conversation memory across
# turns, and the session is deleted on exit (trap) with cb bottesting delete-testsession.
#
# The script defines TURNS but you can edit the array for client-specific probes.

set -euo pipefail

BOT="${1:?Usage: multi-offer-probe.sh <bot_id> <run_dir> [timeout] [mimic_source_id]}"
RUN_DIR="${2:?Usage: multi-offer-probe.sh <bot_id> <run_dir> [timeout] [mimic_source_id]}"
TIMEOUT="${3:-15}"
MIMIC_SOURCE_ID="${4:-}"
CB="${CLOSEBOT_DIR:-$(cd "$(dirname "$0")/../../../.." && pwd)}/cli/cb"

[ -x "$CB" ] || { echo "ERROR: $CB not found or not executable — set CLOSEBOT_DIR"; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq is required"; exit 1; }

mkdir -p "$RUN_DIR"
TRANSCRIPT="$RUN_DIR/transcript.md"

# ── Default probe turns (edit for client-specific scenarios) ──
TURNS=(
  "Hi! I saw an ad for lip filler and wanted to get some info. What do you guys offer?"
  "How much does the lip filler cost?"
  "Can I get a full syringe instead? How much would that be?"
  "Do you guys do botox too? What's the pricing on that?"
  "I heard about a seasonal promotion, is that still available?"
  "Ok so for the lip filler, how does the deposit work? Is it refundable?"
  "I also saw something about a free consultation? Tell me about that"
)
NUM_TURNS=${#TURNS[@]}

{
  echo "# Path A Multi-Offer Probe — $(date -u +%Y-%m-%d)"
  echo
  echo "Bot: \`$BOT\`"
  echo "Method: cb bot test --lead (one testSession, $NUM_TURNS-turn reactive)"
  echo
} > "$TRANSCRIPT"

# Create the session once (Tier 1). A fresh duplicate with no persona returns no leadId.
LEAD=$("$CB" bottesting post-testsession --botId "$BOT" --body '{}' --json | jq -r '.leadId // empty')
if [ -z "$LEAD" ]; then
  echo "FAIL: could not create testSession for $BOT (no_persona? check: $CB bottesting get-testsession --botId $BOT --json)"
  exit 1
fi
echo "Session: \`$LEAD\`" >> "$TRANSCRIPT"; echo >> "$TRANSCRIPT"
cleanup() { "$CB" bottesting delete-testsession --botId "$BOT" --leadId "$LEAD" >/dev/null 2>&1 || echo "WARN: delete-testsession failed for $LEAD — clean up manually"; }
trap cleanup EXIT

if [ -n "$MIMIC_SOURCE_ID" ]; then
  "$CB" bottesting put-testsession --botId "$BOT" --leadId "$LEAD" \
    --body "{\"mimicSourceId\":\"$MIMIC_SOURCE_ID\"}" > /dev/null \
    && echo "Mimicking source: \`$MIMIC_SOURCE_ID\`" >> "$TRANSCRIPT" \
    || echo "WARN: put-testsession mimicSourceId failed — session has no source context" >> "$TRANSCRIPT"
  echo >> "$TRANSCRIPT"
fi

for i in "${!TURNS[@]}"; do
  TURN=$((i + 1))
  MSG="${TURNS[$i]}"
  { echo "## Turn $TURN"; echo "**Customer:** $MSG"; echo; } >> "$TRANSCRIPT"

  OUT="$RUN_DIR/turn${TURN}.json"
  "$CB" bot test "$BOT" "$MSG" --lead "$LEAD" --max-time "$TIMEOUT" --json > "$OUT" || true
  REPLY=$(jq -r '.replies | join(" | ")' "$OUT" 2>/dev/null || echo "(no reply / cb error — see $OUT)")
  NMSG=$(jq -r '.replies | length' "$OUT" 2>/dev/null || echo 0)
  TOOLS=$(jq -r '.tools | join(", ")' "$OUT" 2>/dev/null || true)
  { echo "**Bot ($NMSG msgs):** $REPLY"; [ -n "$TOOLS" ] && echo "_tools: $TOOLS_"; echo; } >> "$TRANSCRIPT"
  echo "Turn $TURN done: $NMSG messages"

  [ "$TURN" -lt "$NUM_TURNS" ] && sleep 2
done

cleanup; trap - EXIT
{ echo; echo "---"; echo "Session cleaned up: \`$LEAD\`"; } >> "$TRANSCRIPT"
echo
echo "=== DONE — transcript at $TRANSCRIPT ==="
