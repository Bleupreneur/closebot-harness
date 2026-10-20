#!/usr/bin/env bash
# cb-view-agents-fleet.sh — view MANY CloseBot bots in parallel, read-only.
#
# Fans out `scripts/cb-view-agent.sh --json` across a list of bot ids, then
# produces a consolidated comparison table + a per-bot red-flag summary.
#
# Tier 0: every underlying call is a GET. Makes NO mutations, NEVER publishes.
#
# Usage:
#   bash scripts/cb-view-agents-fleet.sh                 # ALL bots (GET /bot)
#   bash scripts/cb-view-agents-fleet.sh bot_A bot_B …   # explicit list
#   bash scripts/cb-view-agents-fleet.sh --concurrency 6 # tune fan-out width
#
# Output:
#   - per-bot JSON dumps in a temp dir (path printed at the end, kept for inspection)
#   - a comparison table to stdout
#   - a red-flag summary to stdout
#   - a combined fleet.json (array of all per-bot objects) at the printed path
#
set -euo pipefail

CONCURRENCY=4
BOT_IDS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --concurrency) CONCURRENCY="${2:-}"; [ $# -ge 2 ] && shift;;
    --concurrency=*) CONCURRENCY="${1#*=}";;
    bot_*) BOT_IDS+=("$1");;
    *) ;;
  esac
  shift
done
case "$CONCURRENCY" in
  ''|*[!0-9]*|0*) echo "ERROR: --concurrency needs a positive integer (got '$CONCURRENCY')" >&2; exit 2;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -z "${CLOSEBOT_API_KEY:-}" ] && [ -f "$REPO_DIR/.env" ]; then
  set -a; . "$REPO_DIR/.env"; set +a
fi
# Plugin installs keep config in the user-level dir (cb init --global).
CB_CONFIG_DIR="${CLOSEBOT_CONFIG_DIR:-${HOME:-}/.config/closebot}"
if [ -z "${CLOSEBOT_API_KEY:-}" ] && [ -f "$CB_CONFIG_DIR/.env" ]; then
  set -a; . "$CB_CONFIG_DIR/.env"; set +a
fi
[ -n "${CLOSEBOT_API_KEY:-}" ] || { echo "ERROR: CLOSEBOT_API_KEY not set" >&2; exit 2; }

# If no explicit ids, enumerate the whole account (read-only).
if [ "${#BOT_IDS[@]}" -eq 0 ]; then
  echo "No bot ids given — enumerating all bots via GET /bot ..." >&2
  while IFS= read -r id; do BOT_IDS+=("$id"); done < <(
    # Key goes in via a process-substitution fd, not argv (argv is visible in `ps`).
    curl -s -H @<(printf 'X-CB-KEY: %s\n' "$CLOSEBOT_API_KEY") "https://api.closebot.com/bot" | jq -r '.[].id'
  )
fi
[ "${#BOT_IDS[@]}" -gt 0 ] || { echo "ERROR: no bots to view" >&2; exit 1; }

OUTDIR="$(mktemp -d -t cb-fleet-XXXX)"
echo "Viewing ${#BOT_IDS[@]} bots (concurrency $CONCURRENCY) → $OUTDIR" >&2

# --- fan out: one cb-view-agent.sh --json per bot, capped at $CONCURRENCY ---
run_one() {
  local id="$1"
  bash "$SCRIPT_DIR/cb-view-agent.sh" "$id" --json > "$OUTDIR/$id.json" 2>"$OUTDIR/$id.err" \
    || echo '{"bot_id":"'"$id"'","error":true}' > "$OUTDIR/$id.json"
}

i=0
for id in "${BOT_IDS[@]}"; do
  run_one "$id" &
  i=$((i+1))
  if [ $((i % CONCURRENCY)) -eq 0 ]; then wait; fi
done
wait

# --- combine into one array ---
jq -s '.' "$OUTDIR"/bot_*.json > "$OUTDIR/fleet.json"

echo
echo "##################################################################"
echo "# FLEET COMPARISON (one row per bot)"
echo "##################################################################"
jq -r '
  ["BOT_ID","NAME","INSPECTED","LIVE","DRIFT","NODES","FRAMEWORK","JOB_SHAPE","ORPHANS","FAQ","FILES"],
  ( .[] |
    [ .bot_id,
      (.name // "?"),
      (.inspected_version // "?"),
      (.live_version // "?"),
      (if .draft_vs_live_drift then "YES" else "-" end),
      ((.node_inventory // [] | map(.count) | add) // 0 | tostring),
      (if (.framework_parity.on_framework==true) then "ok" elif (.framework_parity==null) then "?" else "GAP" end),
      (.job_information.shape // "?" | .[0:1]),
      ((.orphan_nodes // []) | length | tostring),
      ((.knowledge_base // []) | map(.smart_faq_count) | add // 0 | tostring),
      ((.knowledge_base // []) | map(.library_files | length) | add // 0 | tostring)
    ]
  ) | @tsv' "$OUTDIR/fleet.json" | column -t -s $'\t'

echo
echo "##################################################################"
echo "# RED-FLAG SUMMARY (per bot)"
echo "##################################################################"
jq -r '
  .[] |
  . as $b |
  ([ # collect flags
    ( if .draft_vs_live_drift then "draft \(.draft_version) unpublished (live \(.live_version))" else empty end ),
    ( (.orphan_nodes // [])[] | "orphan flow node: [\(.type)] \(.title)" ),
    ( (.method_nodes // [])[] | select(.flags.EnableGhlBooking==true and ((.calendar // "")=="")) | "Method \"\(.title)\" books with NO calendar" ),
    ( (.method_nodes // [])[] | select((.flags.EnableSmartFaq==false) and (.flags.EnableLibraryContext==false)) | "Method \"\(.title)\" cannot read KB (both flags off)" ),
    ( (.knowledge_base // [])[] | select(.smart_faq_count==0 and (.library_files|length)==0) | "source \"\(.source_name)\" has NO knowledge (0 FAQ, 0 files)" ),
    ( if ((.method_nodes // []) | map(.calendar) | map(select(. != null and . != "")) | unique | length) > 1
        then "multiple distinct booking calendars across Method nodes" else empty end ),
    ( if (.framework_parity.on_framework == false)
        then "FRAMEWORK GAP — missing canonical agents: " +
             ([ {k:"General Info Collection", v:.framework_parity.has_general_info},
                {k:"Booking Agent",           v:.framework_parity.has_booking_agent},
                {k:"Deposit/Readiness Agent", v:.framework_parity.has_deposit_or_readiness},
                {k:"Handle Pricing",          v:.framework_parity.has_handle_pricing} ]
              | map(select(.v|not) | .k) | join(", ")) +
             " → splice via closebot-apply-template (ref: your template bot)"
        else empty end )
  ]) as $flags |
  "── \(.bot_id)  \(.name // "")" ,
  ( if ($flags|length)==0 then "   ✓ no automated red flags"
    else ($flags[] | "   ⚠ \(.)") end )
' "$OUTDIR/fleet.json"

echo
echo "Combined JSON: $OUTDIR/fleet.json"
echo "Per-bot JSON:  $OUTDIR/<bot_id>.json"
echo "Read-only (Tier 0). Nothing was changed. Hand fixes to closebot-edit-job-flow / -publish-safely."
