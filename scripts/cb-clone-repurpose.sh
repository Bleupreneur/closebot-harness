#!/usr/bin/env bash
# cb-clone-repurpose.sh — clone a CloseBot bot and mechanically re-point the copy
# at a new client/offer in ONE pass: duplicate → swap EVERY booking calendar id
# (structured field AND inline text) → find/replace the old client name across node
# titles, Statement bodies, scenario Descriptions, MultiObjective prose, and the
# business identity (BOTH Job-Information shapes) → save the draft.
#
# It automates the MECHANICAL parts only. It does NOT publish, does NOT rewrite the
# why/important narrative for the new offer, does NOT reconcile a deposit-flow node,
# and does NOT re-attach the GHL source (OAuth-gated). Those manual steps are printed
# at the end and must be done before publishing through closebot-publish-safely.
#
# Tier: 1 (mutates a reversible draft via POST /bot/{id}/save). The duplicate
# (POST /bot/{id}/duplicate) creates a NEW bot, so it is non-destructive to the source.
# It NEVER calls Tier 2 (publish/delete/billing).
#
# Usage:
#   bash scripts/cb-clone-repurpose.sh <source_bot_id> <new_bot_name> [options]
#
#   <source_bot_id>   required, must start with bot_   (the bot to duplicate)
#   <new_bot_name>    required, name to give the duplicate (rename via the new draft)
#
# Options:
#   --ref <bot_id>       reference bot to read the NEW calendar / offer facts from
#                        (read-only). If --cal is omitted, the new calendar is taken
#                        from this bot's first Method GhlBookingCalendarId.
#   --cal <calendar_id>  explicit new GHL booking calendar id to write everywhere.
#                        Overrides --ref's calendar.
#   --old-name "X"       old client/offer name to find (e.g. "Old Brand Wellness").
#   --new-name "Y"       new client/offer name to replace it with (e.g. "Acme Med Spa").
#                        --old-name and --new-name must be given together.
#   --dry-run            print intended changes and a diff summary; save NOTHING.
#
# Env: reads CLOSEBOT_API_KEY from ./.env (auto-loaded) or the environment.
#
# Examples:
#   # Clone your template bot for a new client, preview only:
#   bash scripts/cb-clone-repurpose.sh "$CB_TEMPLATE_BOT" "Acme Med Spa - Booking Agent" \
#     --ref bot_XXXXXXXXXXXXXXXX --cal <CALENDAR_ID> \
#     --old-name "Old Brand Wellness" --new-name "Acme Med Spa" --dry-run
#
#   # Same, for real (duplicates + saves the draft, still does not publish):
#   bash scripts/cb-clone-repurpose.sh "$CB_TEMPLATE_BOT" "Acme Med Spa - Booking Agent" \
#     --cal <CALENDAR_ID> --old-name "Old Brand Wellness" --new-name "Acme Med Spa"
#
# Exit codes: 0 ok · 2 bad input / missing deps · 1 API failure / save rejected
set -euo pipefail

API="https://api.closebot.com"
GRAY="\033[90m"; GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; BOLD="\033[1m"; NC="\033[0m"
die()  { echo -e "${RED}✗ $*${NC}" >&2; exit "${2:-2}"; }
note() { echo -e "$*" >&2; }
hr()   { printf '\n%b──────────────────────────────────────────────────────────────%b\n%b# %s%b\n' "$GRAY" "$NC" "$BOLD" "$1" "$NC" >&2; }

# --- arg parse ---------------------------------------------------------------
SRC_BOT=""; NEW_NAME=""; REF_BOT=""; NEW_CAL=""; OLD_NAME=""; NEW_CLIENT=""; DRY=0
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --ref)      REF_BOT="${2:-}"; shift 2 ;;
    --cal)      NEW_CAL="${2:-}"; shift 2 ;;
    --old-name) OLD_NAME="${2:-}"; shift 2 ;;
    --new-name) NEW_CLIENT="${2:-}"; shift 2 ;;
    --dry-run)  DRY=1; shift ;;
    -h|--help)  sed -n '2,60p' "$0"; exit 0 ;;
    -*)         die "unknown option: $1" ;;
    *)          POSITIONAL+=("$1"); shift ;;
  esac
done
SRC_BOT="${POSITIONAL[0]:-}"
NEW_NAME="${POSITIONAL[1]:-}"

[ -n "$SRC_BOT" ]  || die "usage: bash scripts/cb-clone-repurpose.sh <source_bot_id> <new_bot_name> [--ref <bot>] [--cal <id>] [--old-name X --new-name Y] [--dry-run]"
[ -n "$NEW_NAME" ] || die "missing <new_bot_name> (the name for the duplicate)"
case "$SRC_BOT" in bot_*) ;; *) die "source_bot_id must start with bot_ (got '$SRC_BOT')" ;; esac
[ -z "$REF_BOT" ] || case "$REF_BOT" in bot_*) ;; *) die "--ref must start with bot_ (got '$REF_BOT')" ;; esac

# --old-name and --new-name are a pair: both or neither.
if { [ -n "$OLD_NAME" ] && [ -z "$NEW_CLIENT" ]; } || { [ -z "$OLD_NAME" ] && [ -n "$NEW_CLIENT" ]; }; then
  die "--old-name and --new-name must be given together"
fi

command -v jq   >/dev/null || die "jq not installed"
command -v curl >/dev/null || die "curl not installed"

# --- load .env (key is NOT auto-exported into each shell) --------------------
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
[ -n "${CLOSEBOT_API_KEY:-}" ] || die "CLOSEBOT_API_KEY not set (and no .env at $REPO_DIR/.env or $CB_CONFIG_DIR/.env)"
H=(-H "X-CB-KEY: ${CLOSEBOT_API_KEY}")

# --- temp files: always write API responses to disk, run jq against the FILE.
#     CloseBot step payloads contain unescaped control chars in some strings that
#     crash jq when piped through a shell variable, but parse fine from a file. ---
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
SRC_F="$TMP/src_bot.json"; DUP_F="$TMP/dup_bot.json"; REF_F="$TMP/ref_bot.json"
REFSTEPS_F="$TMP/ref_steps.json"; STEPS_F="$TMP/steps.json"; ORIG_F="$TMP/steps.original.json"
EDIT_F="$TMP/steps.edited.json"

# version resolver: the HEAD version = highest semver across ALL versions, same as
# `cb bot version <id>` .target. Never "last unpublished" — that resurrects stale
# drafts once the head is published (GOTCHAS 2026-07-02).
resolve_ver() { jq -r '.versions // [] | sort_by(.version | split(".") | map(tonumber? // 0))
                        | last | .version // empty' "$1"; }

echo -e "${BOLD}CloseBot clone→repurpose${NC}  source=$SRC_BOT  new-name=\"$NEW_NAME\"  $([ "$DRY" -eq 1 ] && echo '(DRY-RUN)')" >&2

# --- 0. verify source bot exists --------------------------------------------
curl -s "${H[@]}" "$API/bot/$SRC_BOT" > "$SRC_F"
jq -e '.id' "$SRC_F" >/dev/null 2>&1 \
  || { head -c 400 "$SRC_F" >&2; echo >&2; die "could not fetch source bot $SRC_BOT (key invalid, bot missing, or spec drift)" 1; }
note "${GREEN}✓ source bot found:${NC} $(jq -r '.name' "$SRC_F")"

# --- 1. resolve the NEW calendar (Tier 0 read of --ref if --cal not given) ---
if [ -z "$NEW_CAL" ] && [ -n "$REF_BOT" ]; then
  hr "Reading reference bot $REF_BOT for the new calendar (read-only)"
  curl -s "${H[@]}" "$API/bot/$REF_BOT" > "$REF_F"
  jq -e '.id' "$REF_F" >/dev/null 2>&1 || die "could not fetch reference bot $REF_BOT" 1
  REF_VER="$(resolve_ver "$REF_F")"
  curl -s "${H[@]}" "$API/bot/$REF_BOT/steps?botVersion=$REF_VER" > "$REFSTEPS_F"
  NEW_CAL="$(jq -r '[.nodes[]? | select(.type=="Method") | .data.GhlBookingCalendarId
                     | select(. != null and . != "")] | first // empty' "$REFSTEPS_F")"
  [ -n "$NEW_CAL" ] \
    && note "${GREEN}✓ new calendar from --ref:${NC} $NEW_CAL" \
    || note "${YELLOW}⚠ --ref has no Method calendar id; pass --cal explicitly to swap calendars${NC}"
fi

# --- 2. resolve source draft + pull its steps (this is what duplicate copies) -
SRC_VER="$(resolve_ver "$SRC_F")"
[ -n "$SRC_VER" ] && [ "$SRC_VER" != "null" ] || die "could not resolve a version for $SRC_BOT" 1
curl -s "${H[@]}" "$API/bot/$SRC_BOT/steps?botVersion=$SRC_VER" > "$STEPS_F"
jq -e '.nodes' "$STEPS_F" >/dev/null 2>&1 || die "could not fetch steps for $SRC_BOT @ $SRC_VER" 1
cp "$STEPS_F" "$ORIG_F"

# --- report what we found in the SOURCE before touching anything --------------
hr "Source inspection (version $SRC_VER)"
OLD_CALS="$(jq -r '[.nodes[]? | select(.type=="Method") | .data.GhlBookingCalendarId
                    | select(. != null and . != "")] | unique | join(", ")' "$STEPS_F")"
note "  Method booking calendars present : ${OLD_CALS:-<none>}"
note "  Job Information shape            : $(jq -r '
        .variables.business as $b |
        if (($b.overallPromptSections // []) | length) > 0 then "A (overallPromptSections)"
        elif (($b.whyText // "") != "" or ($b.importantText // "") != "") then "B (whyText/importantText)"
        else "EMPTY" end' "$STEPS_F")"
note "  Deposit-flow node present        : $(jq -r '
        if ([.nodes[]? | select((.data.Title // "") | test("[Dd]eposit"))] | length) > 0
        then "YES → [" + ([.nodes[]? | select((.data.Title // "") | test("[Dd]eposit")) | .data.Title] | join(", ")) + "]  (reconcile manually if new offer has no deposit)"
        else "none" end' "$STEPS_F")"
if [ -n "$OLD_NAME" ]; then
  NHITS="$(grep -oF "$OLD_NAME" "$STEPS_F" | wc -l | tr -d ' ')"
  note "  \"$OLD_NAME\" occurrences in steps  : ${NHITS}"
fi

# --- 3. DUPLICATE the source (creates the new bot) ---------------------------
if [ "$DRY" -eq 1 ]; then
  hr "DRY-RUN — would now POST /bot/$SRC_BOT/duplicate (skipped)"
  DUP_BOT="bot_<NEW_DUPLICATE_ID>"
  # In dry-run we mutate the SOURCE steps locally just to show the diff; nothing is saved.
  cp "$STEPS_F" "$EDIT_F"
else
  hr "Duplicating source → new bot"
  curl -s -X POST "${H[@]}" "$API/bot/$SRC_BOT/duplicate" > "$DUP_F"
  DUP_BOT="$(jq -r '.id // empty' "$DUP_F")"
  [ -n "$DUP_BOT" ] || { head -c 400 "$DUP_F" >&2; echo >&2; die "duplicate did not return a bot id" 1; }
  note "${GREEN}✓ duplicate created:${NC} $DUP_BOT"

  # Pull the duplicate's OWN head version (a fresh dup is usually 0.0.1 and may already be published — never assume).
  curl -s "${H[@]}" "$API/bot/$DUP_BOT" > "$DUP_F"
  DUP_VER="$(resolve_ver "$DUP_F")"
  [ -n "$DUP_VER" ] && [ "$DUP_VER" != "null" ] || die "could not resolve a draft version on the new duplicate $DUP_BOT" 1
  curl -s "${H[@]}" "$API/bot/$DUP_BOT/steps?botVersion=$DUP_VER" > "$STEPS_F"
  jq -e '.nodes' "$STEPS_F" >/dev/null 2>&1 || die "could not fetch steps for the duplicate $DUP_BOT @ $DUP_VER" 1
  cp "$STEPS_F" "$ORIG_F"           # diff baseline = the untouched duplicate
  cp "$STEPS_F" "$EDIT_F"
  note "  duplicate draft version: $DUP_VER"
fi

# --- 4. MECHANICAL SWAPS on $EDIT_F -----------------------------------------
hr "Applying mechanical swaps"

# 4a. Calendar swap — structured field on EVERY Method/Booking node, AND inline text.
#     (Verified: nurse bot carries the calendar id inside Section bodies too, e.g.
#      "Check availability on the calendar: <id>" — a field-only swap leaves those live.)
if [ -n "$NEW_CAL" ]; then
  # collect old calendar ids (every Method/Booking field that isn't the new one).
  # Calendar ids never contain whitespace, so a plain word-split for-loop is safe
  # here and keeps us compatible with macOS bash 3.2 (no mapfile/readarray). The
  # list is also written to a file so the diff-summary section can reuse it.
  OLDCALS_F="$TMP/oldcals.txt"
  jq -r '[ (.nodes[]? | select(.type=="Method")  | .data.GhlBookingCalendarId),
           (.nodes[]? | select(.type=="Booking") | .data.CalendarId) ]
         | map(select(. != null and . != "")) | unique | .[]' "$EDIT_F" > "$OLDCALS_F" 2>/dev/null || true
  # ALSO collect calendar-id-shaped tokens that appear ONLY in inline text (Method
  # section bodies / Instructions) near the word "calendar". A foreign calendar id can
  # live there without ever appearing in a structured field, so a field-only sweep
  # leaves it live (live gotcha 2026-06-22, bot_XXXXXXXXXXXXXXXX). Exclude the new cal.
  jq -r --arg new "${NEW_CAL:-}" '
    [ .. | strings | select(test("calendar";"i"))
      | scan("(?<![A-Za-z0-9])[A-Za-z0-9]{20}(?![A-Za-z0-9])") ]
    | unique | map(select(. != $new)) | .[]?' "$EDIT_F" >> "$OLDCALS_F" 2>/dev/null || true
  sort -u "$OLDCALS_F" -o "$OLDCALS_F" 2>/dev/null || true
  # structured swap
  jq --arg cal "$NEW_CAL" '
    .nodes |= map(
      if .type=="Method"  then .data.GhlBookingCalendarId = $cal
      elif .type=="Booking" then .data.CalendarId = $cal
      else . end )' "$EDIT_F" > "$EDIT_F.tmp" && mv "$EDIT_F.tmp" "$EDIT_F"
  note "  calendar (structured) → $NEW_CAL  on all Method/Booking nodes"
  # inline text swap for each distinct old id that isn't already the new one
  while IFS= read -r oc; do
    [ -n "$oc" ] && [ "$oc" != "$NEW_CAL" ] || continue
    jq --arg old "$oc" --arg new "$NEW_CAL" '
      walk(if type=="string" then gsub($old; $new) else . end)' "$EDIT_F" > "$EDIT_F.tmp" && mv "$EDIT_F.tmp" "$EDIT_F"
    note "  calendar (inline text) → replaced $oc everywhere"
  done < "$OLDCALS_F"
else
  note "${YELLOW}  ⚠ no --cal / --ref calendar resolved — calendars NOT swapped (manual step below)${NC}"
fi

# 4b. Client/offer name find-replace — node Titles, Statement bodies, Scenario
#     Descriptions, MultiObjective prose, AND the business identity. Done as a
#     whole-tree string walk so no occurrence is missed (Sections, Instructions,
#     Prompts, prohibitedWords, etc.), then the identity fields are reported.
if [ -n "$OLD_NAME" ]; then
  jq --arg old "$OLD_NAME" --arg new "$NEW_CLIENT" '
    walk(if type=="string" then gsub($old; $new) else . end)' "$EDIT_F" > "$EDIT_F.tmp" && mv "$EDIT_F.tmp" "$EDIT_F"
  RHITS="$(grep -oF "$NEW_CLIENT" "$EDIT_F" | wc -l | tr -d ' ')"
  note "  name find/replace: \"$OLD_NAME\" → \"$NEW_CLIENT\"  (now $RHITS occurrence(s) of the new name)"
else
  note "${GRAY}  (no --old-name/--new-name given — name find/replace skipped)${NC}"
fi

# 4c. Rename the bot itself (the name lives on the steps-level variables, surfaced
#     in the UI; we also report the BotDto name which is set at duplicate time).
#     The steps payload doesn't carry the bot's display name, so the rename here is
#     limited to find/replace already done above; flag the explicit rename as manual
#     if the new display name differs from a pure find/replace result.

# --- 5. validation (same discipline as closebot-edit-job-flow) ---------------
hr "Pre-save validation"
fail=0
chk() { if [ "$1" -eq 0 ]; then note "  ${GREEN}✓${NC} $2"; else note "  ${RED}✗ FAIL:${NC} $2"; fail=1; fi; }
chk "$(jq '.nodes | group_by(.id) | map(select(length>1)) | length' "$EDIT_F")" "unique node ids"
chk "$(jq '.nodes as $n | .edges | map(select(
        (.source as $s | ($n|map(.id)|index($s))==null) or
        (.target as $t | ($n|map(.id)|index($t))==null))) | length' "$EDIT_F")" "no dangling edges"
chk "$(jq '.nodes | map(select(.type=="Booking" and (.data.CalendarId // "")=="")) | length' "$EDIT_F")" "Booking nodes have CalendarId"
chk "$(jq '.nodes | map(select(.type=="Method" and .data.EnableGhlBooking==true and (.data.GhlBookingCalendarId // "")=="")) | length' "$EDIT_F")" "Method+EnableGhlBooking has a calendar"
SRCN="$(jq '.nodes | map(select(.type=="Source")) | length' "$EDIT_F")"
chk "$([ "$SRCN" -gt 0 ] && echo 0 || echo 1)" "Source node still present"
[ "$fail" -eq 0 ] || die "validation failed — NOT saving. Fix the above and re-run." 1

# --- 6. diff summary ---------------------------------------------------------
hr "Diff summary (baseline = $([ "$DRY" -eq 1 ] && echo 'source steps' || echo 'untouched duplicate'))"
CHANGED="$(diff <(jq -S . "$ORIG_F") <(jq -S . "$EDIT_F") | grep -cE '^[<>]' || true)"
note "  changed JSON lines: ${CHANGED:-0}"
if [ -n "$NEW_CAL" ]; then
  note "  calendars now (Method): $(jq -r '[.nodes[]? | select(.type=="Method") | .data.GhlBookingCalendarId] | unique | join(", ")' "$EDIT_F")"
fi
if [ -n "$NEW_CAL" ] && [ -f "${OLDCALS_F:-}" ]; then
  c=0
  while IFS= read -r oc; do
    [ -n "$oc" ] && [ "$oc" != "$NEW_CAL" ] || continue
    c=$(( c + $(grep -oF "$oc" "$EDIT_F" | wc -l | tr -d ' ') ))
  done < "$OLDCALS_F"
  note "  remaining old calendar id refs anywhere: $c"
fi
# independent post-swap scan: ANY calendar-context 20-char id in section/instruction
# text that still differs from the new calendar is a possible foreign-calendar leak
# (defense in depth — doesn't rely on the pre-known old-id list).
if [ -n "$NEW_CAL" ]; then
  STRAY="$(jq -r --arg new "$NEW_CAL" '
    [ .. | strings | select(test("calendar";"i"))
      | scan("(?<![A-Za-z0-9])[A-Za-z0-9]{20}(?![A-Za-z0-9])") ]
    | unique | map(select(. != $new)) | length' "$EDIT_F" 2>/dev/null || echo 0)"
  if [ "${STRAY:-0}" != "0" ]; then
    note "  ${YELLOW}⚠ ${STRAY} calendar-context id(s) in section/instruction text still differ from $NEW_CAL — inspect for a foreign calendar leak${NC}"
  else
    note "  ${GREEN}✓ no stray inline calendar ids${NC} (section/instruction text references only $NEW_CAL)"
  fi
fi
if [ -n "$OLD_NAME" ]; then
  note "  remaining \"$OLD_NAME\" refs: $(grep -oF "$OLD_NAME" "$EDIT_F" | wc -l | tr -d ' ')"
fi

# --- 7. save (or stop, if dry-run) ------------------------------------------
if [ "$DRY" -eq 1 ]; then
  hr "DRY-RUN complete — nothing saved, no bot duplicated"
  note "  Re-run without --dry-run to duplicate $SRC_BOT and save the swaps."
else
  hr "Saving draft to $DUP_BOT"
  RESP="$(jq '{botSteps: .}' "$EDIT_F" | curl -s -X POST "${H[@]}" \
            -H "Content-Type: application/json" --data-binary @- "$API/bot/$DUP_BOT/save")"
  SAVED_VER="$(echo "$RESP" | jq -r '.version // empty')"
  INVALID="$(echo "$RESP" | jq -r '(.invalidPaths // []) | length')"
  if [ "${INVALID:-1}" != "0" ]; then
    note "${RED}✗ SAVE INCOMPLETE — invalidPaths:${NC}"
    echo "$RESP" | jq '.invalidPaths' >&2
    die "draft partially updated; fix the listed paths and re-run" 1
  fi
  note "${GREEN}✓ saved cleanly${NC}  version=$SAVED_VER  invalidPaths=[]"
  # verify the swap stuck (re-pull the version the save landed on)
  curl -s "${H[@]}" "$API/bot/$DUP_BOT/steps?botVersion=$SAVED_VER" > "$TMP/verify.json"
  if [ -n "$NEW_CAL" ]; then
    VCAL="$(jq -r '[.nodes[]? | select(.type=="Method") | .data.GhlBookingCalendarId] | unique | join(",")' "$TMP/verify.json")"
    [ "$VCAL" = "$NEW_CAL" ] \
      && note "${GREEN}✓ verified:${NC} all Method calendars = $NEW_CAL on saved version $SAVED_VER" \
      || note "${YELLOW}⚠ verify mismatch:${NC} saved Method calendars = $VCAL (UI autosave clobber? have the user close the editor tab and re-run)"
  fi
  # NOTE: do NOT auto-run a sandbox test here. A fresh duplicate inherits a persona
  # reference it can't use → the test session returns "no_persona" and the bot won't
  # reply until a persona is assigned in the UI (see MANUAL STEPS, persona gate). If
  # you ever add a status check, use GET /bot/{id}/testSession (reads lastMessage +
  # mostRecentFailureReason, returns immediately) — NEVER the listen endpoint, which
  # is a long-poll that hangs; if you must hit it, bound it with curl --max-time.
fi

# --- 8. MANUAL STEPS BLOCK (always printed) ---------------------------------
TARGET_ID="${DUP_BOT}"
cat >&2 <<EOF

$(printf '%b' "$BOLD")════════════════════════════════════════════════════════════════
 MANUAL STEPS STILL REQUIRED  (this script did the mechanical parts only)
════════════════════════════════════════════════════════════════$(printf '%b' "$NC")
 Target draft: ${TARGET_ID}$([ "$DRY" -eq 1 ] && echo '  (DRY-RUN — not created yet)')

 1. REWRITE the business narrative for the new offer — the find/replace above
    swaps names but does NOT rewrite meaning. Edit Job Information:
      • Shape A: variables.business.overallPromptSections[]
                 ("Why the conversation is happening" / "Important business information")
      • Shape B: variables.business.whyText / variables.business.importantText
    Pull the NEW client's real facts first — never invent address/provider/pricing:
      bash scripts/ghl-business-facts.sh ${TARGET_ID}
    Then use the closebot-repurpose-bot skill to swap the narrative properly.

 2. VERIFY offer / pricing — confirm the MultiObjective "Handle Pricing" objectives,
    Method "Promotional Offer of Interests" sections, and any prices match the NEW
    offer (the source's offer text survives find/replace untouched).

 3. RECONCILE the deposit flow (if the new offer has NO deposit) — this is a CONTENT
    rewrite + RETITLE, NOT edge surgery. Do NOT delete the node or rewire edges.
    Instead, on the "Deposit Confirmation Agent" Method node: rewrite its Sections[].Body
    + Instructions to the new offer's booking behaviour and RETITLE the node (.data.Title)
    to something offer-appropriate, then strip every "$ deposit required" mention from
    the why-text and all other Method sections. Leaving the edges intact keeps the flow
    valid; only the node's content + title change. Use closebot-edit-job-flow.

 4. REASSIGN the GHL source — the duplicate inherited the SOURCE bot's source
    attachment, so {{location.*}} merge fields and live messaging resolve to the
    WRONG client until reassigned. Adding/binding a fresh GHL source is OAUTH-GATED
    and is NOT API-callable (OAuth flow only). Do it in the CloseBot UI, then
    confirm with: bash scripts/ghl-business-facts.sh ${TARGET_ID}

 5. ★ PERSONA — HARD GATE, BLOCKS TESTING ★  A duplicate inherits a persona reference
    it CANNOT use; the sandbox returns "no_persona" and the bot WON'T REPLY at all until
    you assign a persona. Assigning a persona is UI-DROPDOWN ONLY (no API). Set it in
    app.closebot.com BEFORE you test or publish — testing without it is wasted effort.

 6. RENAME the bot display name to "${NEW_NAME}" in the UI if the duplicate kept the
    source's "(copy)" name (the steps API does not carry the bot's display name).

 7. VIEW + TEST before publish:
      bash scripts/cb-view-agent.sh ${TARGET_ID}      # read-only audit + red-flag scan
    Only test AFTER the persona gate (step 5) is satisfied. For a non-hanging status
    check use GET /bot/{id}/testSession (lastMessage + mostRecentFailureReason); never
    poll the listen endpoint bare (it long-polls) — bound it with curl --max-time.
    Then PUBLISH via the gate: invoke the closebot-publish-safely skill.
    NEVER publish from this script.
EOF

echo -e "\n${GREEN}Done (mechanical phase).${NC} Draft is NOT published." >&2
