#!/usr/bin/env bash
# cb-audit-loop.sh — audit → auto-fix → re-audit loop for one CloseBot bot (or the fleet).
#
#   bash scripts/cb-audit-loop.sh <bot_id> [--auto] [--max-iter N] [--json]
#   bash scripts/cb-audit-loop.sh --fleet  [--auto] [--max-iter N]
#
#   default     dry-run: audit, classify findings, apply NOTHING. Exit 0 if clean.
#   --auto      apply WHITELISTED mechanical fixes to the HEAD version (highest semver),
#               then re-audit; loop until no auto-fixable findings remain or --max-iter.
#   --max-iter  safety cap on audit→fix cycles (default 5).
#   --json      emit one machine-readable report object on stdout (human log → stderr).
#   --fleet     run against every bot from GET /bot; per-bot reports + summary table.
#
# WHAT IT WILL AUTO-FIX (the whitelist — deterministic, content-free, proven live):
#   W1  attached_but_unreadable: library files attached but a Method has
#       EnableLibraryContext=false → flip to true (live-proven fix, 2026-06-24,
#       three client bots: two published heads + one draft).
#   W2  Method with EnableSmartFaq=false AND EnableLibraryContext=false while the
#       bot's source HAS Smart FAQs → flip EnableSmartFaq=true (KB exists, bot blind).
# Everything else (contradictions, leaks, framework gaps, orphans, collisions,
# missing calendars, empty Job Information) needs judgment → emitted in the report's
# `agent_queue` for the closebot-audit-loop skill to fix, one finding at a time.
#
# HARD SAFETY RAILS:
#   • Tier 1 only. NEVER calls /publish, never DELETEs, never touches billing.
#   • Edits the HEAD version only (highest semver, as `cb bot version` .target — never
#     "last unpublished"); if the head is published, /save forks a new draft (normal
#     CloseBot behavior) — the live bot is untouched.
#   • Every save is verified by re-pulling the returned version and asserting the
#     flag actually changed (UI-autosave clobber detection). Verify fail = abort.
#   • Publish stays with closebot-publish-safely + a human. Always.
#
set -euo pipefail

API="https://api.closebot.com"
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
[ -n "${CLOSEBOT_API_KEY:-}" ] || { echo "CLOSEBOT_API_KEY not set (see .env)" >&2; exit 2; }
# Reference bot for framework-gap fixes: CB_TEMPLATE_BOT (env / ./.env) or cb.config.json templateBot.
TEMPLATE_BOT="${CB_TEMPLATE_BOT:-$(jq -r '.templateBot // empty' "$REPO_DIR/cb.config.json" 2>/dev/null || true)}"
[ -n "$TEMPLATE_BOT" ] || TEMPLATE_BOT="$(jq -r '.templateBot // empty' "$CB_CONFIG_DIR/cb.config.json" 2>/dev/null || true)"
# Every CloseBot call goes through cbcurl: the key is read by curl from a
# process-substitution fd (-H @file), never placed on argv where any local user
# could see it via `ps`. printf is a bash builtin, so no child process sees it either.
cbcurl() { curl -H @<(printf 'X-CB-KEY: %s\n' "$CLOSEBOT_API_KEY") "$@"; }

# --- args ---
BOT_ID=""; AUTO=0; MAX_ITER=5; JSON_OUT=0; FLEET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --auto)     AUTO=1 ;;
    --json)     JSON_OUT=1 ;;
    --fleet)    FLEET=1 ;;
    --max-iter) shift; MAX_ITER="${1:-5}" ;;
    bot_*)      BOT_ID="$1" ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done
if [ "$FLEET" -eq 0 ] && [ -z "$BOT_ID" ]; then
  echo "usage: cb-audit-loop.sh <bot_id> [--auto] [--max-iter N] [--json]  |  --fleet [--auto]" >&2; exit 2
fi

TMP="$(mktemp -d /tmp/closebot-loop.XXXXXX)"; trap 'rm -rf "$TMP"' EXIT
log() { printf '%s\n' "$*" >&2; }

############################################################################
# audit_once <bot_id> <outfile>  — one audit pass → findings JSON
# Combines cb-view-agent --json (structured) with the §12 ⚠ lines from the
# human report (contradiction/leak scans that only exist there).
############################################################################
newest_version() {  # highest semver across ALL versions — NOT "last unpublished".
  # A stale abandoned draft can sit later in the array than the published head;
  # auditing/pulling it would resurrect old content (live catch: a draft at 0.0.4 on a bot whose live head was 0.0.13).
  cbcurl -s "$API/bot/$1" \
    | jq -r '.versions | sort_by(.version | split(".") | map(tonumber)) | last | .version'
}

audit_once() {
  local bot="$1" out="$2" aj="$TMP/a.json" ah="$TMP/a.txt" ver
  ver="$(newest_version "$bot")"
  bash "$SCRIPT_DIR/cb-view-agent.sh" "$bot" "$ver" --json > "$aj" 2>/dev/null
  bash "$SCRIPT_DIR/cb-view-agent.sh" "$bot" "$ver" > "$ah" 2>/dev/null || true
  local warns; warns="$(grep '⚠' "$ah" | sed 's/^[[:space:]]*//' | jq -R . | jq -s .)"
  jq --argjson warns "$warns" --arg tpl "${TEMPLATE_BOT:-your template bot (set CB_TEMPLATE_BOT)}" '
    . as $a |
    # W1: library attached but a Method cannot read it
    ( if .library_readability.attached_but_unreadable then
        [ .library_readability.methods_with_library_off[] |
          {rule:"W1", node_title:., fix:"EnableLibraryContext=true"} ]
      else [] end ) as $w1 |
    # W2: both KB flags off while Smart FAQs exist on a source
    ( ([.knowledge_base[]?.smart_faq_count] | add // 0) as $faqs |
      if $faqs > 0 then
        [ .method_nodes[] | select(.flags.EnableSmartFaq==false and .flags.EnableLibraryContext==false) |
          {rule:"W2", node_title:.title, fix:"EnableSmartFaq=true"} ]
      else [] end ) as $w2 |
    {
      bot_id, name, inspected_version, live_version, draft_version, draft_vs_live_drift,
      auto_queue: ($w1 + $w2),
      agent_queue: (
        [ (if (.framework_parity.on_framework|not) then
            {type:"framework_gap", detail:(.framework_parity | del(.on_framework)), recipe:("closebot-apply-template (ref: " + $tpl + ")")} else empty end),
          (.orphan_nodes[]? | {type:"orphan_node", detail:., recipe:"closebot-edit-job-flow: wire an inbound edge or delete + splice bypass"}),
          # the template framework DUPLICATES these titles by design (Booking Agent ×2,
          # Transfer Message ×4, paired global scenarios) — not findings:
          (.title_collisions[]?
            | select(.title | IN("Booking Agent","Transfer Message","ai_booking_error",
                                 "not_interested","Aggression","Human Handover") | not)
            | {type:"title_collision", detail:., recipe:"closebot-edit-job-flow: retitle for disambiguation"}),
          (.method_nodes[]? | select(.flags.EnableGhlBooking==true and ((.calendar // "")=="")) |
            {type:"missing_calendar", detail:{node:.title}, recipe:"closebot-edit-job-flow: set GhlBookingCalendarId (confirm id with user/GHL)"}),
          (if (.job_information.shape|startswith("EMPTY")) then
            {type:"empty_job_information", detail:{}, recipe:"closebot-repurpose-bot: populate variables.business from GHL facts"} else empty end),
          ($warns[] | select(test("CONTRADICTION|LEAK")) | {type:"content_warning", detail:., recipe:"closebot-edit-job-flow: reconcile wording (verify real facts first — see verify-offers-against-live-ads)"}),
          ($warns[] | select(test("EMPTY LABEL VALUE")) | {type:"empty_label_value", detail:., recipe:"closebot-edit-job-flow: template the blank label with a source variable (e.g. {{source.*}}) or fill it with the real value — live gotcha 2026-09-05"}),
          ($warns[] | select(test("EMPTY FLOW VARIABLE")) | {type:"empty_flow_variable", detail:., recipe:"cb botsourcevariable post-botvariables: set the value — an attach with the schema-minimum body writes every declared variable as \"\", overriding its default (closebot-attach-knowledge gotcha 2026-09-05)"})
        ] ),
      ui_gated: (
        [ (if ((.sources // [])|length)==0 then {type:"no_source_attached", note:"source creation is OAuth/UI only"} else empty end)
        ] ),
      raw_warnings: $warns
    }' "$aj" > "$out"
}

############################################################################
# apply_auto <bot_id> <findings_json>  — flip whitelisted flags on the draft
############################################################################
apply_auto() {
  local bot="$1" f="$2"
  local n; n="$(jq '.auto_queue|length' "$f")"
  [ "$n" -gt 0 ] || return 0

  local ver steps="$TMP/steps.json" resp="$TMP/save.json"
  # Pull from the NEWEST version by semver (live head or newest draft) — never a
  # stale abandoned draft, which /save could resurrect as the new draft.
  ver="$(newest_version "$bot")"
  cbcurl -s "$API/bot/$bot/steps?botVersion=$ver" > "$steps"

  # Flip every queued flag on its named Method node.
  jq --slurpfile q "$f" '
    ($q[0].auto_queue) as $fixes |
    .nodes |= map(
      if .type=="Method" then
        .data.Title as $t |
        reduce ($fixes[] | select(.node_title==$t)) as $fx (.;
          if $fx.fix=="EnableLibraryContext=true" then .data.EnableLibraryContext=true
          elif $fx.fix=="EnableSmartFaq=true"     then .data.EnableSmartFaq=true
          else . end)
      else . end)' "$steps" > "$steps.new"

  jq '{botSteps: .}' "$steps.new" | cbcurl -s -X POST "$API/bot/$bot/save" \
    -H "Content-Type: application/json" --data-binary @- > "$resp"
  local saved_ver invalid
  saved_ver="$(jq -r '.version // empty' "$resp")"
  invalid="$(jq -r '(.invalidPaths // [])|length' "$resp")"
  [ "$invalid" = "0" ] || { log "  ✗ save returned invalidPaths — aborting auto-fix"; jq '.invalidPaths' "$resp" >&2; return 1; }
  [ -n "$saved_ver" ] || { log "  ✗ save returned no version — aborting"; return 1; }

  # Verify: re-pull the version the save landed on; every queued flag must now be true.
  local verify="$TMP/verify.json"
  cbcurl -s "$API/bot/$bot/steps?botVersion=$saved_ver" > "$verify"
  local bad
  bad="$(jq --slurpfile q "$f" '
    ($q[0].auto_queue) as $fixes |
    [ $fixes[] as $fx | .nodes[] | select(.type=="Method" and .data.Title==$fx.node_title) |
      select( ($fx.fix=="EnableLibraryContext=true" and .data.EnableLibraryContext!=true)
           or ($fx.fix=="EnableSmartFaq=true"       and .data.EnableSmartFaq!=true) ) ] | length' "$verify")"
  if [ "$bad" != "0" ]; then
    log "  ✗ VERIFY FAILED on draft $saved_ver — likely a UI autosave clobber. Close the app.closebot.com tab and re-run."
    return 1
  fi
  log "  ✓ applied $n whitelisted fix(es) → draft $saved_ver (verified)"
  return 0
}

############################################################################
# run_bot <bot_id>  — the loop
############################################################################
run_bot() {
  local bot="$1" iter=1 f="$TMP/findings.json" applied=0
  while :; do
    if ! audit_once "$bot" "$f"; then
      log "[$bot] audit failed — skipping"; echo "{\"bot_id\":\"$bot\",\"error\":\"audit_failed\"}" > "$f"; break
    fi
    local na ng nu
    na="$(jq '.auto_queue|length' "$f" 2>/dev/null || echo 0)"
    ng="$(jq '.agent_queue|length' "$f" 2>/dev/null || echo 0)"
    nu="$(jq '.ui_gated|length' "$f" 2>/dev/null || echo 0)"
    na="${na:-0}"; ng="${ng:-0}"; nu="${nu:-0}"
    log "[$bot] iter $iter — auto-fixable:$na agent-queue:$ng ui-gated:$nu"
    if [ "$na" -eq 0 ] || [ "$AUTO" -eq 0 ]; then break; fi
    if [ "$iter" -ge "$MAX_ITER" ]; then log "  ⚠ max-iter $MAX_ITER reached"; break; fi
    apply_auto "$bot" "$f" || break
    applied=$(( applied + na )); iter=$(( iter + 1 ))
  done
  jq --argjson iter "$iter" --argjson applied "$applied" --argjson auto "$AUTO" \
     '. + {iterations:$iter, fixes_applied:$applied, mode:(if $auto==1 then "auto" else "dry-run" end),
           clean: ((.auto_queue|length)==0 and (.agent_queue|length)==0 and (.ui_gated|length)==0)}' "$f"
}

############################################################################
# main
############################################################################
if [ "$FLEET" -eq 1 ]; then
  ALL="$TMP/fleet.json"; : > "$ALL"
  for b in $(cbcurl -s "$API/bot" | jq -r '.[].id'); do
    run_bot "$b" >> "$ALL" || log "[$b] loop errored — continuing fleet"
  done
  jq -s '.' "$ALL" > "$TMP/fleet-arr.json"
  log ""
  log "── FLEET SUMMARY ──"
  jq -r '.[] | [( if .error then "ERROR" elif .clean then "CLEAN" else "FLAGS" end), .bot_id, (.name // "?"),
                "auto:\((.auto_queue // [])|length)", "agent:\((.agent_queue // [])|length)", "ui:\((.ui_gated // [])|length)",
                "applied:\(.fixes_applied // 0)"] | join("  ")' "$TMP/fleet-arr.json" >&2
  [ "$JSON_OUT" -eq 1 ] && cat "$TMP/fleet-arr.json" || true
  jq -e 'all(.clean == true)' "$TMP/fleet-arr.json" >/dev/null && exit 0 || exit 1
else
  OUT="$(run_bot "$BOT_ID")"
  if [ "$JSON_OUT" -eq 1 ]; then printf '%s\n' "$OUT"
  else
    printf '%s\n' "$OUT" | jq -r '
      "bot: \(.bot_id)  (\(.name))  draft:\(.draft_version)  mode:\(.mode)  iterations:\(.iterations)  applied:\(.fixes_applied)",
      "clean: \(.clean)",
      (if (.auto_queue|length)>0 then "AUTO-FIXABLE REMAINING:", (.auto_queue[]|"  • [\(.rule)] \(.node_title): \(.fix)") else empty end),
      (if (.agent_queue|length)>0 then "AGENT QUEUE (needs judgment — closebot-audit-loop skill):", (.agent_queue[]|"  • [\(.type)] \(.detail|tostring|.[0:140])\n      → \(.recipe)") else empty end),
      (if (.ui_gated|length)>0 then "UI-GATED (human in CloseBot UI):", (.ui_gated[]|"  • \(.type) — \(.note)") else empty end)'
  fi
  printf '%s\n' "$OUT" | jq -e '.clean' >/dev/null && exit 0 || exit 1
fi
