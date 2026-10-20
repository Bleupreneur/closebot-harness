#!/usr/bin/env bash
# cb-view-agent.sh — comprehensive, read-only dump of a single CloseBot bot.
#
# Tier 0: every call is a GET. Makes NO mutations, NEVER publishes.
# Use this to understand / audit how a bot is configured before editing it.
#
# Usage:
#   bash scripts/cb-view-agent.sh <bot_id> [version] [--json]
#
#   <bot_id>    required, must start with bot_
#   [version]   optional, e.g. 0.0.7. Default = the HEAD version (highest semver,
#               same as `cb bot version <id>` .target) — never "last unpublished",
#               which resurrects stale drafts once the head is published.
#               Pass the live published version explicitly to inspect what's live.
#   --json      emit ONE structured JSON object instead of the human report
#               (for the parallel comparison workflow to consume).
#
# Env: reads CLOSEBOT_API_KEY from ./.env (auto-loaded) or the environment.
#
# Examples:
#   bash scripts/cb-view-agent.sh bot_XXXXXXXXXXXXXXXX            # head version, human report
#   bash scripts/cb-view-agent.sh bot_XXXXXXXXXXXXXXXX 0.0.14     # specific (e.g. live) version
#   bash scripts/cb-view-agent.sh bot_XXXXXXXXXXXXXXXX --json     # machine-readable, head version
#
# Template bot: the framework-parity check names your reference bot in its fix hint.
# Set it with CB_TEMPLATE_BOT=bot_... (env or ./.env) or cb.config.json {"templateBot":"bot_..."}.
#
set -euo pipefail

# --- arg parse (version and --json are both optional, any order after bot_id) ---
BOT_ID="${1:-}"
[ -n "$BOT_ID" ] || { echo "usage: bash scripts/cb-view-agent.sh <bot_id> [version] [--json]" >&2; exit 2; }
shift
JSON_MODE=0
REQ_VER=""
for arg in "$@"; do
  case "$arg" in
    --json) JSON_MODE=1 ;;
    *)      REQ_VER="$arg" ;;
  esac
done

API="https://api.closebot.com"

# --- load .env (the key is NOT auto-exported into each shell) ---
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
[ -n "${CLOSEBOT_API_KEY:-}" ] || { echo "ERROR: CLOSEBOT_API_KEY not set (and no .env found at $REPO_DIR/.env or $CB_CONFIG_DIR/.env)" >&2; exit 2; }
TEMPLATE_BOT="${CB_TEMPLATE_BOT:-$(jq -r '.templateBot // empty' "$REPO_DIR/cb.config.json" 2>/dev/null || true)}"
[ -n "$TEMPLATE_BOT" ] || TEMPLATE_BOT="$(jq -r '.templateBot // empty' "$CB_CONFIG_DIR/cb.config.json" 2>/dev/null || true)"
TEMPLATE_REF="${TEMPLATE_BOT:-your template bot — set CB_TEMPLATE_BOT or cb.config.json templateBot}"

# Every CloseBot call goes through cbcurl: the key is read by curl from a
# process-substitution fd (-H @file), never placed on argv where any local user
# could see it via `ps`. printf is a bash builtin, so no child process sees it either.
cbcurl() { curl -H @<(printf 'X-CB-KEY: %s\n' "$CLOSEBOT_API_KEY") "$@"; }

# --- temp files: we ALWAYS write API responses to disk and run jq against the
#     FILE, never `echo "$VAR" | jq`. CloseBot step payloads contain unescaped
#     control characters in some string fields that crash jq when piped through
#     a shell variable / process substitution, but parse fine from a file. ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
BOT_F="$TMP/bot.json"
STEPS_F="$TMP/steps.json"
LIB_F="$TMP/library.json"

# --- 1. fetch bot meta ---
cbcurl -s "$API/bot/$BOT_ID" > "$BOT_F"
if ! jq -e '.id' "$BOT_F" >/dev/null 2>&1; then
  echo "ERROR: could not fetch bot $BOT_ID (key invalid, bot missing, or spec drift)." >&2
  head -c 400 "$BOT_F" >&2; echo >&2
  exit 1
fi

# --- 2. resolve versions (never hardcode 0.0.1) ---
# Mirrors `cb bot version <id>` (cli/lib/versions.mjs resolveTarget): HEAD = highest
# semver across ALL versions; LIVE = highest-semver published version; DRAFT = HEAD only
# if HEAD is unpublished. Never "last unpublished" — a stale abandoned draft can sit
# later in the array than the published head (GOTCHAS 2026-07-02).
SEMVER_SORT='sort_by(.version | split(".") | map(tonumber? // 0))'
HEAD_V="$(jq -r ".versions // [] | $SEMVER_SORT | last | .version // empty" "$BOT_F")"
HEAD_PUB="$(jq -r ".versions // [] | $SEMVER_SORT | last | .published // false" "$BOT_F")"
LIVE_V="$(jq -r "[.versions[]? | select(.published==true)] | $SEMVER_SORT | last | .version // empty" "$BOT_F")"
if [ "$HEAD_PUB" = "true" ]; then DRAFT_V=""; else DRAFT_V="$HEAD_V"; fi
if [ -n "$REQ_VER" ]; then
  VER="$REQ_VER"
else
  VER="$HEAD_V"
fi
[ -n "$VER" ] && [ "$VER" != "null" ] || { echo "ERROR: could not resolve a version for $BOT_ID" >&2; exit 1; }

# --- 3. fetch steps for that version (botVersion REQUIRED despite OpenAPI) ---
cbcurl -s "$API/bot/$BOT_ID/steps?botVersion=$VER" > "$STEPS_F"
if ! jq -e '.nodes' "$STEPS_F" >/dev/null 2>&1; then
  echo "ERROR: could not fetch steps for $BOT_ID @ $VER (botVersion missing/invalid?)." >&2
  head -c 400 "$STEPS_F" >&2; echo >&2
  exit 1
fi

# --- 4. fetch account-wide library files ONCE.
#     NOTE: GET /library/files?sourceId=... IGNORES the query param and returns
#     the whole account list. Attachment is implicit via each file's sources[].id.
#     There is NO per-file `enabled` flag — `fileStatus` ("indexed" etc.) is the
#     closest health signal. Field names are fileId/fileName/fileType/fileStatus. ---
cbcurl -s "$API/library/files" > "$LIB_F"
jq -e 'type=="array"' "$LIB_F" >/dev/null 2>&1 || echo '[]' > "$LIB_F"

# --- 5. fetch the account persona list.
#     IMPORTANT: the persona block embedded in the steps payload
#     (.variables.persona) is a STALE SNAPSHOT frozen when that bot version was
#     saved — its botIds/bots/description reflect the moment of the save, not the
#     current state. Verified live 2026-08-11: a bot's embedded snapshot listed
#     botIds=["bot_WP2…"] while GET /persona showed that same persona attached to
#     five bots including the one being inspected. Linkage and current persona
#     config MUST come from GET /persona; the embedded copy is only useful for
#     detecting drift. ---
PERS_F="$TMP/personas.json"
cbcurl -s "$API/persona" > "$PERS_F"
jq -e 'type=="array"' "$PERS_F" >/dev/null 2>&1 || echo '[]' > "$PERS_F"

############################################################################
# JSON MODE — one structured object for the parallel comparison workflow
############################################################################
if [ "$JSON_MODE" -eq 1 ]; then
  # Smart-FAQ counts need a per-source GET; collect them into a {srcId: count} map.
  FAQMAP="$TMP/faqmap.json"; echo '{}' > "$FAQMAP"
  for SID in $(jq -r '.sources[]?.id' "$BOT_F"); do
    N="$(cbcurl -s "$API/smart-faq?sourceId=$SID" | jq 'if type=="array" then length else 0 end' 2>/dev/null || echo 0)"
    jq --arg s "$SID" --argjson n "${N:-0}" '.[$s]=$n' "$FAQMAP" > "$FAQMAP.tmp" && mv "$FAQMAP.tmp" "$FAQMAP"
  done

  jq -n \
    --slurpfile bot   "$BOT_F" \
    --slurpfile steps "$STEPS_F" \
    --slurpfile lib   "$LIB_F" \
    --slurpfile faq   "$FAQMAP" \
    --slurpfile pers  "$PERS_F" \
    --arg ver "$VER" \
    --arg livev "$LIVE_V" \
    --arg draftv "$DRAFT_V" '
    ($bot[0])   as $b |
    (if $livev  == "" then null else $livev  end) as $live |
    (if $draftv == "" then null else $draftv end) as $draft |
    ($steps[0]) as $s |
    ($lib[0])   as $L |
    ($faq[0])   as $F |
    ($pers[0])  as $P |
    (reduce ($s.edges[]? ) as $e ({}; .[$e.target]=true)) as $inbound |
    (reduce ($s.nodes[]?) as $n ({}; .[($n.data.Title // $n.data.name // $n.type)] += 1)) as $titleCount |
    ({
      bot_id: $b.id, name: $b.name, category: $b.category,
      inspected_version: $ver,
      live_version:  $live,
      draft_version: $draft,
      draft_vs_live_drift: ($draft != null and $draft != $live),
      account_tools: [ $b.tools[]? | {type, enabled} ],
      sources: [ $b.sources[]? | { id, name, ghl_location_key: .key, enabled, channels: .channelList, tags: [.tags[]?.name], personaNameOverride } ],
      persona: (
        ([ $P[] | select((.botIds // []) | index($b.id)) ] | first) as $p |
        ($s.variables.persona) as $snap |
        (["agent","bot","bots","the","and","for","with","from","new","copy","test","demo",
          "draft","drafted","client","actual","main","live","prod","clone","template",
          "default","assistant","persona","updated","offers","all"]) as $stop |
        (def toks($t): ($t // "") | ascii_downcase | [scan("[a-z0-9]{3,}")] | unique
           | map(select(. as $w | $stop | index($w) | not));
         ((toks(($b.name // "") + " " + ([$b.sources[]?.name] | join(" "))))) as $own |
         if $p == null then
           { attached: false, no_persona_risk: true,
             note: "no persona in GET /persona lists this bot in botIds — CloseBot returns mostRecentFailureReason:\"no_persona\" and the bot will NOT reply. Assign in the UI.",
             stale_embedded_snapshot: (if $snap == null then null else { persona_id: $snap.id, name: $snap.personaName } end) }
         else
           { attached: true,
             persona_id: $p.id, name: $p.personaName, description: $p.description,
             voice_styles: $p.voiceStyles, how_to_respond: $p.howToRespond,
             typo_percent: $p.typoPercent,
             breakup_large_message_percent: $p.breakupLargeMessagePercent,
             response_time: $p.responseTime, response_delay: $p.responseDelay,
             ai_provider_preferences: ($p.aiProviderPreferences // []),
             is_default: $p.default, favorited: $p.favorited,
             modified_at: $p.modifiedAt, modified_by: $p.modifiedBy,
             shared_with_bot_count: (($p.botIds // []) | length),
             shared_with_bot_names: [ $p.bots[]?.name ],
             description_is_foreign: (
               ((toks($p.description)) | length) > 0
               and (((toks($p.description)) - $own) == (toks($p.description))) ),
             embedded_snapshot_drift: (
               ($snap != null) and (($snap.id // "") != $p.id) ),
             voice_flags: (
               [ (if ($p.typoPercent // 0) > 0 then "typoPercent=\($p.typoPercent) — bot injects deliberate typos" else empty end),
                 (if (($p.aiProviderPreferences // []) | length) == 0 then "no aiProviderPreferences set — provider order is unpinned" else empty end),
                 (if ($p.default // false) then "persona is the ACCOUNT DEFAULT — PUT /persona/{id} on it has an irreversible default-flip" else empty end),
                 (if (($p.botIds // []) | length) > 1 then "persona is SHARED by \(($p.botIds // []) | length) bots — editing it changes every one of them" else empty end) ]
             ) }
         end )
      ),
      job_information: (
        $s.variables.business as $biz |
        if (($biz.overallPromptSections // []) | length) > 0 then
          { shape:"A (overallPromptSections)", sections:[($biz.overallPromptSections[])|{Title,Body}], prohibitedWords:($biz.prohibitedWords // []) }
        elif (($biz.whyText // "") != "" or ($biz.importantText // "") != "") then
          { shape:"B (whyText/importantText)", whyText:$biz.whyText, importantText:$biz.importantText, prohibitedWords:($biz.prohibitedWords // []) }
        else
          { shape:"EMPTY (no Job Information set)", prohibitedWords:($biz.prohibitedWords // []) } end ),
      node_inventory: ( [ $s.nodes[]?.type ] | group_by(.) | map({type:.[0], count:length}) ),
      method_nodes: [ $s.nodes[]? | select(.type=="Method") | {
        id, title:.data.Title, calendar:(.data.GhlBookingCalendarId // null),
        flags:([.data|to_entries[]|select(.key|startswith("Enable"))|{(.key):.value}]|add),
        enabled_custom_tools:(.data.EnabledCustomTools // []),
        enabled_mcp_servers:(.data.EnabledMcpServers // []),
        sections:[(.data.Sections // [])[]|{Title,Body}],
        instructions:(.data.Instructions // null) } ],
      multiobjective_nodes: [ $s.nodes[]? | select(.type=="MultiObjective") | {
        id, name:(.data.name // .data.Title),
        objectives:[(.data.Objectives // [])[]|{title:(.Title // .Name), instructions:(.Instructions // .Description // .Body)}] } ],
      scenario_nodes: [ $s.nodes[]? | select(.type|startswith("Scenario")) | {
        type, title:.data.Title, priority:.data.Priority, threshold:.data.Threshold,
        allow_reentry:.data.AllowReEntry, description:.data.Description } ],
      statement_nodes: [ $s.nodes[]? | select(.type=="Statement") | { title:.data.Title, message:(.data.Message // .data.Statement // .data.Body) } ],
      modifytags_nodes: [ $s.nodes[]? | select(.type=="ModifyTags") | { title:.data.Title, add:[.data.TagsToAdd[]?.Tag], remove:[.data.TagsToRemove[]?.Tag] } ],
      other_nodes: [ $s.nodes[]? | select(.type|test("^(Method|MultiObjective|Scenario.*|Statement|ModifyTags)$")|not) | { type, title:(.data.Title // .data.name // .id), calendar:(.data.CalendarId // null) } ],
      edges: [ $s.edges[]? | { source, target, handle:.sourceHandle } ],
      orphan_nodes: [ $s.nodes[]? | select(.type!="Source") | select((.type|startswith("Scenario"))|not) | select($inbound[.id] != true) | { id, type, title:(.data.Title // .data.name // .id) } ],
      title_collisions: ( $titleCount | to_entries | map(select(.value>1)) | map({title:.key, count:.value}) ),
      framework_parity: (
        ([ $s.nodes[]? | select(.type=="Method") | (.data.Title // "") ]) as $m |
        ([ $s.nodes[]? | select(.type=="MultiObjective") | (.data.Objectives // [])[] | (.Title // .Name // "") ]) as $obj |
        { has_general_info:          ($m  | any(test("general info";"i"))),
          has_booking_agent:         ($m  | any(test("booking agent";"i"))),
          has_deposit_or_readiness:  ($m  | any(test("deposit|readiness";"i"))),
          has_handle_pricing:        ($obj | any(test("pricing";"i"))) }
        | . + { on_framework: (.has_general_info and .has_booking_agent and .has_deposit_or_readiness and .has_handle_pricing) } ),
      library_readability: (
        ([ $b.sources[]? as $src | $L[] | select(any(.sources[]?; .id==$src.id)) ] | length) as $attached |
        ([ $s.nodes[]? | select(.type=="Method" and .data.EnableLibraryContext==false) | (.data.Title // "") ]) as $libOff |
        { attached_library_files: $attached,
          methods_with_library_off: $libOff,
          attached_but_unreadable: (($attached > 0) and (($libOff | length) > 0)) } ),
      knowledge_base: [
        $b.sources[]? as $src | {
          source_id: $src.id,
          source_name: $src.name,
          smart_faq_count: ($F[$src.id] // 0),
          library_files: [ $L[] | select(any(.sources[]?; .id==$src.id)) | { fileId, fileName, fileType, fileStatus, fileSize } ]
        }
      ]
    }) as $o |
    # --- red_flags[]: {code, severity: "FAIL"|"WARN", message} built from the SAME
    #     predicates as the §12 human-mode red-flag scan below. FAIL = the classes the
    #     pre-move publish-safely skill asserted inline (missing calendar, orphan node)
    #     plus the two structural gaps the framework-parity / persona checks catch that it
    #     never did. WARN = everything else §12 flags (KB posture, drift, collisions,
    #     inline calendar leaks). This is what `cb bot publish` filters on for its
    #     pre-flight gate — see cli/lib/bot.mjs. Reuses fields already computed in $o
    #     (orphan_nodes, framework_parity, persona, draft_vs_live_drift, title_collisions,
    #     library_readability) so there is exactly one source of truth per check; only the
    #     checks with no existing $o field (missing-calendar, KB-off-both, multiple
    #     calendars, inline calendar leak) are recomputed here directly off $s/$L.
    $o + { red_flags: (
      [ $o.orphan_nodes[]? | {code:"ORPHAN_NODE", severity:"FAIL",
          message:"[\(.type)] \(.title) is unreachable (no inbound edge)"} ]
      + [ $s.nodes[]? | select(.type=="Method" and .data.EnableGhlBooking==true and ((.data.GhlBookingCalendarId // "")=="")) |
          {code:"MISSING_CALENDAR", severity:"FAIL",
           message:"Method \"\(.data.Title)\" has EnableGhlBooking=true but no GhlBookingCalendarId"} ]
      + ( if ($o.framework_parity.on_framework | not) then
            [ {code:"FRAMEWORK_GAP", severity:"FAIL",
               message:("missing recommended agent node(s): " + ([
                 (if ($o.framework_parity.has_general_info | not) then "General Info Collection" else empty end),
                 (if ($o.framework_parity.has_booking_agent | not) then "Booking Agent" else empty end),
                 (if ($o.framework_parity.has_deposit_or_readiness | not) then "Deposit/Booking-Readiness Agent" else empty end),
                 (if ($o.framework_parity.has_handle_pricing | not) then "Handle Pricing MultiObjective" else empty end)
               ] | join("; ")))} ]
          else [] end )
      + ( if ($o.persona.attached | not) then
            [ {code:"NO_PERSONA", severity:"FAIL",
               message:"no persona attached — bot will not reply (mostRecentFailureReason: no_persona). Assign in the UI."} ]
          else [] end )
      + [ $s.nodes[]? | select(.type=="Method" and .data.EnableSmartFaq==false and .data.EnableLibraryContext==false) |
          {code:"KB_DISABLED", severity:"WARN",
           message:"Method \"\(.data.Title)\" has both EnableSmartFaq and EnableLibraryContext off (cannot use KB)"} ]
      + ( if $o.library_readability.attached_but_unreadable then
            [ $o.library_readability.methods_with_library_off[]? | {code:"LIBRARY_CONTEXT_OFF_WITH_FILES", severity:"WARN",
                message:"Method \"\(.)\" has EnableLibraryContext=false while library files are attached to the source"} ]
          else [] end )
      + ( ([ $s.nodes[]? | select(.type=="Method") | .data.GhlBookingCalendarId | select(. != null and . != "") ] | unique) as $cals |
          if ($cals | length) > 1 then
            [ {code:"MULTIPLE_CALENDARS", severity:"WARN",
               message: (($cals | length | tostring) + " distinct booking calendars across Method nodes: " + ($cals | join(", ")))} ]
          else [] end )
      + [ $o.title_collisions[]? | {code:"TITLE_COLLISION", severity:"WARN",
          message:"title \"\(.title)\" appears \(.count)x"} ]
      + ( if $o.draft_vs_live_drift then
            [ {code:"DRAFT_LIVE_DRIFT", severity:"WARN",
               message:"draft \($o.draft_version) is unpublished; live is \($o.live_version). Edits are not live."} ]
          else [] end )
      + ( if ($o.persona.attached and ($o.persona.description_is_foreign // false)) then
            [ {code:"PERSONA_DESCRIPTION_MISMATCH", severity:"WARN",
               message:"persona description shares no identity token with this bot — possible leftover branding"} ]
          else [] end )
      + ( ([ $s.nodes[]? | (select(.type=="Method") | .data.GhlBookingCalendarId), (select(.type=="Booking") | .data.CalendarId) ]
           | map(select(. != null and . != "")) | unique) as $validCals |
          [ $s.nodes[]? | select(.type=="Method") | . as $n |
            ( [ (($n.data.Sections // [])[]?.Body // ""), ($n.data.Instructions // "") ]
              | map(select(test("calendar"; "i")))
              | map([scan("[A-Za-z0-9]{20,}")]) | flatten | unique
              | map(select((IN($validCals[])) | not)) ) as $leaks |
            $leaks[] | {code:"INLINE_CALENDAR_LEAK", severity:"WARN",
              message:"Method \"\($n.data.Title)\" references id \(.) in section/instructions text, but it is not a configured booking calendar"} ] )
      + ( ($s.variables.business) as $biz |
          ( if (($biz.overallPromptSections // []) | length) > 0 then
              [ $biz.overallPromptSections[]?.Body ]
            elif (($biz.whyText // "") != "" or ($biz.importantText // "") != "") then
              [ ($biz.whyText // ""), ($biz.importantText // "") ]
            else [] end ) as $texts |
          [ $texts[] | select(. != null) | split("\n")[] | select(test("^[A-Za-z][A-Za-z0-9 /_-]{1,40}:[ \t]*$")) ]
          | unique
          | map({code:"EMPTY_LABEL_VALUE", severity:"WARN",
                 message:("Job Information has a label with no value: \"" + . + "\" — the model may treat this as unknown instead of calling a KB/template")}) )
      + ( [ $b.sources[]? | . as $src | ($src.flowVariableValues // {}) | to_entries[] | select(.value == "") |
            {code:"EMPTY_FLOW_VARIABLE", severity:"WARN",
             message:("source \"" + ($src.name // $src.id) + "\" has flow variable \"" + .key + "\" set to \"\" — overrides any default value")} ] )
    ) }' "$BOT_F"
  exit 0
fi

############################################################################
# HUMAN MODE — 13-section readable report (default)
############################################################################
hr() { printf '\n##################################################################\n# %s\n##################################################################\n' "$1"; }

echo "=== CloseBot bot view: $BOT_ID @ version $VER ==="

hr "1. BOT META + VERSIONS + ACCOUNT TOOLS + SOURCES"
jq --arg livev "$LIVE_V" --arg draftv "$DRAFT_V" '{
  id, name, category,
  live_version:  (if $livev  == "" then null else $livev  end),
  draft_version: (if $draftv == "" then null else $draftv end),
  version_count: (.versions | length),
  account_tools: [ .tools[]? | {type, enabled} ],
  sources: [ .sources[]? | {
    id, name, ghl_location_key: .key, enabled,
    channels: .channelList, tags: [.tags[]?.name], personaNameOverride
  } ]
}' "$BOT_F"

# draft-vs-live drift banner
# LIVE_V / DRAFT_V resolved in step 2 (highest semver; DRAFT_V empty when the head is published)
if [ -n "$DRAFT_V" ] && [ "$DRAFT_V" != "$LIVE_V" ]; then
  echo "  ⚠ DRAFT/LIVE DRIFT: draft $DRAFT_V is unpublished; live is $LIVE_V. Edits in the draft are NOT live."
fi

hr "2. NODE INVENTORY (by type)"
jq -r '.nodes | "total nodes: \(length)"' "$STEPS_F"
jq -r '.nodes[].type' "$STEPS_F" | sort | uniq -c

hr "3. JOB INFORMATION (variables.business — auto-detects shape A vs B)"
jq -r '
  .variables.business as $biz |
  if (($biz.overallPromptSections // []) | length) > 0 then
    "SHAPE A — overallPromptSections[]\n" +
    ([ $biz.overallPromptSections[] | "### \(.Title)\n\(.Body)" ] | join("\n\n"))
  elif (($biz.whyText // "") != "" or ($biz.importantText // "") != "") then
    "SHAPE B — whyText / importantText (flat med-spa layout)\n" +
    "### Why the conversation is happening\n\($biz.whyText)\n\n" +
    "### Important business information\n\($biz.importantText)"
  else
    "⚠ EMPTY — no Job Information set on this bot."
  end' "$STEPS_F"
echo
jq -r '"Prohibited words: \(.variables.business.prohibitedWords // [])"' "$STEPS_F"

hr "4. METHOD NODES — tool flags + calendar + full section wording"
jq -r '.nodes[] | select(.type=="Method") |
  "=== METHOD: \(.data.Title)   (id \(.id))\n" +
  "-- flags --\n" +
  ([ .data | to_entries[] | select(.key|startswith("Enable")) | "  \(.key) = \(.value)" ] | join("\n")) +
  "\n  GhlBookingCalendarId = \(.data.GhlBookingCalendarId // "unset")\n" +
  "  EnabledCustomTools   = \(.data.EnabledCustomTools // [])\n" +
  "  EnabledMcpServers    = \(.data.EnabledMcpServers // [])\n" +
  "-- sections --\n" +
  ([ (.data.Sections // [])[] | "### \(.Title)\n\(.Body)" ] | join("\n\n")) +
  "\n-- instructions --\n" + (.data.Instructions // "(none)")' "$STEPS_F"

hr "5. MULTIOBJECTIVE NODES — objectives"
jq -r '.nodes[] | select(.type=="MultiObjective") |
  "=== \(.data.name // .data.Title // "MultiObjective")   (id \(.id))\n" +
  ([ (.data.Objectives // [])[] |
     "• \(.Title // .Name // "?")\n\(.Instructions // .Description // .Body // "")" ] | join("\n\n"))' "$STEPS_F"

hr "6. SCENARIO NODES — triggers (fire from anywhere; no inbound edge is EXPECTED)"
jq -r '.nodes[] | select(.type|startswith("Scenario")) |
  "• [\(.type)] \(.data.Title // "?")  (Priority \(.data.Priority // "?"), Threshold \(.data.Threshold // "?"), ReEntry \(.data.AllowReEntry // "?"))\n   \(.data.Description // "")"' "$STEPS_F"

hr "7. STATEMENT NODES — fixed messages sent to the lead"
jq -r '.nodes[] | select(.type=="Statement") |
  "• \(.data.Title // "?"): \(.data.Message // .data.Statement // .data.Body // "")"' "$STEPS_F"

hr "8. MODIFYTAGS NODES — tag side effects"
jq -r '.nodes[] | select(.type=="ModifyTags") |
  "• \(.data.Title // "?")  add:\([.data.TagsToAdd[]?.Tag])  remove:\([.data.TagsToRemove[]?.Tag])"' "$STEPS_F"

hr "9. OTHER NODES (Source / End / Booking / etc.)"
jq -r '.nodes[] | select(.type|test("^(Method|MultiObjective|Scenario.*|Statement|ModifyTags)$")|not) |
  "• [\(.type)] \(.data.Title // .data.name // .id)\(if .data.CalendarId then "  CalendarId=\(.data.CalendarId)" else "" end)"' "$STEPS_F"

hr "10. GRAPH / FLOW (source -> target, ids disambiguated, handle shown)"
# Title can collide (e.g. 4x "Transfer Message"); append a short id slug to keep edges unambiguous.
jq -r '
  (reduce .nodes[] as $n ({}; .[$n.id] = ((($n.data.Title // $n.data.name // $n.type)) + "#" + ($n.id[0:6])))) as $label
  | .edges[]? |
    "  \($label[.source] // .source)  -->  \($label[.target] // .target)" +
    (if .sourceHandle then "   [\(.sourceHandle)]" else "" end)' "$STEPS_F"

hr "11. KNOWLEDGE BASE (per source: Smart FAQ count + ATTACHED library files)"
# Library list is account-wide and the sourceId query param is ignored — filter
# client-side on sources[].id. Smart FAQ count is a per-source GET.
for SID in $(jq -r '.sources[]?.id' "$BOT_F"); do
  SNAME="$(jq -r --arg s "$SID" '.sources[] | select(.id==$s) | .name' "$BOT_F")"
  echo "--- source $SID ($SNAME) ---"
  FAQ_F="$TMP/faq_$SID.json"
  cbcurl -s "$API/smart-faq?sourceId=$SID" > "$FAQ_F"
  if jq -e 'type=="array"' "$FAQ_F" >/dev/null 2>&1; then
    echo "  Smart FAQs: $(jq 'length' "$FAQ_F")"
  else
    echo "  Smart FAQs: (could not read)"
  fi
  echo "  Library files attached to this source:"
  COUNT="$(jq -r --arg s "$SID" '[ .[] | select(any(.sources[]?; .id==$s)) ] | length' "$LIB_F")"
  if [ "$COUNT" -eq 0 ]; then
    echo "    (none attached — this source relies on Smart FAQs only)"
  else
    jq -r --arg s "$SID" '.[] | select(any(.sources[]?; .id==$s)) |
      "    - \(.fileName) [\(.fileType)] status=\(.fileStatus) size=\(.fileSize)"' "$LIB_F"
  fi
done

hr "12. RED-FLAG SCAN (automated)"
# (a) true orphans — unreachable flow nodes (exclude Source + Scenario*)
ORPHANS="$(jq -r '
  (reduce .edges[] as $e ({}; .[$e.target]=true)) as $inbound |
  .nodes[] | select(.type!="Source") | select((.type|startswith("Scenario"))|not) |
  select($inbound[.id] != true) |
  "  ⚠ ORPHAN (unreachable, no inbound edge): [\(.type)] \(.data.Title // .data.name // .id)  (id \(.id[0:8])…)"' "$STEPS_F")"
[ -n "$ORPHANS" ] && echo "$ORPHANS" || echo "  ✓ no orphaned flow nodes"

# (b) Method has EnableGhlBooking but no calendar
jq -r '.nodes[] | select(.type=="Method" and .data.EnableGhlBooking==true and ((.data.GhlBookingCalendarId // "")=="")) |
  "  ⚠ Method \"\(.data.Title)\" has EnableGhlBooking=true but NO GhlBookingCalendarId"' "$STEPS_F"

# (c) Method that reads KB but flags off
jq -r '.nodes[] | select(.type=="Method" and (.data.EnableSmartFaq==false and .data.EnableLibraryContext==false)) |
  "  ⚠ Method \"\(.data.Title)\" has BOTH EnableSmartFaq and EnableLibraryContext off (cannot use KB)"' "$STEPS_F"

# (h) LIBRARY-CONTEXT-OFF-WITH-FILES — the asymmetric KB footgun (live gotcha 2026-06-24,
# bot_XXXXXXXXXXXXXXXX: EnableSmartFaq=true but EnableLibraryContext=false meant the bot
# could read Smart FAQs yet was BLIND to every attached library file — pricing lived only
# in a library .md, so the bot couldn't quote it). Smart FAQ and library files are SEPARATE
# retrieval paths (docs/AGENT-BUILDING.md): one flag on does NOT cover the other. Check (c)
# only fires when BOTH are off, so it misses this. Only warn when the bot's source(s)
# actually have library files attached — otherwise LibraryContext=false is harmless.
HAS_LIB_FILES="$(jq -r --slurpfile lib "$LIB_F" '
  [ .sources[]?.id ] as $sids
  | [ $lib[0][] | select(any(.sources[]?; (.id as $i | $sids | index($i)))) ] | length' "$BOT_F" 2>/dev/null || echo 0)"
if [ "${HAS_LIB_FILES:-0}" -gt 0 ]; then
  jq -r '.nodes[] | select(.type=="Method" and .data.EnableLibraryContext==false and .data.EnableSmartFaq==true) |
    "  ⚠ Method \"\(.data.Title)\" has EnableLibraryContext=false while library files ARE attached to the source — bot is BLIND to those files (Smart FAQ ≠ library; separate retrieval paths). Flip EnableLibraryContext=true via closebot-edit-job-flow."' "$STEPS_F"
fi

# (d) title collisions (ambiguous in UI / graph)
jq -r '[.nodes[] | .data.Title // .data.name // .type] | group_by(.) | map(select(length>1)) |
  .[] | "  • title collision: \"\(.[0])\" appears \(length)× (disambiguated by id in graph above)"' "$STEPS_F"

# (e) multiple distinct calendar IDs across Method nodes (possible mismatch)
CALS="$(jq -r '[.nodes[] | select(.type=="Method") | .data.GhlBookingCalendarId | select(. != null and . != "")] | unique' "$STEPS_F")"
NCAL="$(echo "$CALS" | jq 'length')"
if [ "$NCAL" -gt 1 ]; then echo "  ⚠ $NCAL distinct booking calendars across Method nodes: $CALS"; fi

# (g) INLINE CALENDAR LEAK — a calendar-id-shaped token sitting in a Method node's
# section bodies or Instructions that is NOT one of the bot's configured booking
# calendars. A foreign calendar id can live in inline text without ever appearing in a
# structured field, so the field-only check (e) misses it (live gotcha 2026-06-22,
# bot_XXXXXXXXXXXXXXXX: a wrong id survived in a Section Body AND .data.Instructions).
# Only fires on calendar-context strings (mention "calendar") to avoid matching other
# 20-char ids. `|| true` so a no-match never trips set -o pipefail.
STRAYCAL="$(jq -r '
  ([ .nodes[]? | (select(.type=="Method")|.data.GhlBookingCalendarId),
                 (select(.type=="Booking")|.data.CalendarId) ]
   | map(select(. != null and . != "")) | unique) as $valid
  | .nodes[]? | select(.type=="Method") | .data.Title as $t
  | ( [ (.data.Sections // [])[]?.Body // "", (.data.Instructions // "") ]
      | [ .[] | select(test("calendar";"i"))
          | scan("(?<![A-Za-z0-9])[A-Za-z0-9]{20}(?![A-Za-z0-9])") ]
      | unique | map(select((IN($valid[])) | not)) )
  | .[]? | "  ⚠ INLINE CALENDAR LEAK: Method \"" + $t + "\" references id " + . + " in section/instructions text, but it is not a configured booking calendar"
' "$STEPS_F" 2>/dev/null || true)"
[ -n "$STRAYCAL" ] && echo "$STRAYCAL" || true

# (i) EMPTY LABEL VALUE IN JOB INFO — a "Label: " line with nothing after the colon
# before the newline (live gotcha 2026-09-05, bot_XXXXXXXXXXXXXXXX: "Office Hours: "
# with no value made the model treat hours as unknown and refuse to call the KB tool,
# even though a source variable could have filled it). Scans whichever Job-Info shape
# (A overallPromptSections / B whyText+importantText) is populated.
jq -r '
  .variables.business as $biz |
  ( if (($biz.overallPromptSections // []) | length) > 0 then
      [ $biz.overallPromptSections[]?.Body ]
    elif (($biz.whyText // "") != "" or ($biz.importantText // "") != "") then
      [ ($biz.whyText // ""), ($biz.importantText // "") ]
    else [] end ) as $texts |
  [ $texts[] | select(. != null) | split("\n")[] | select(test("^[A-Za-z][A-Za-z0-9 /_-]{1,40}:[ \t]*$")) ]
  | unique | .[]
  | "  ⚠ EMPTY LABEL VALUE in Job Information: \"\(.)\" has no value — the model may treat this as unknown instead of calling a KB/template. Template it (e.g. {{source.*}}) rather than leaving it blank."
' "$STEPS_F"

# (j) EMPTY FLOW VARIABLE — a source attached to this bot has a flow variable whose
# value is "" (live gotcha 2026-09-05: `cb bot post-source` with the schema-minimum
# body writes every declared variable as "", overriding its default — e.g. hours
# reverted to blank after attach). An empty string is a live value, not "unset", so it
# silently wins over any default defined on the source.
jq -r '.sources[]? | . as $src | ($src.flowVariableValues // {}) | to_entries[] |
  select(.value == "") |
  "  ⚠ EMPTY FLOW VARIABLE: source \"\($src.name // $src.id)\" has \"\(.key)\" set to \"\" — this overrides any default value (cb botsourcevariable post-botvariables to set it)"' "$BOT_F"

# (f) CONTRADICTORY FACTS across nodes — the CloseBot footgun that survives manual review.
# Build a single text corpus from Job Information + every Method Section body + every
# MultiObjective objective, then scan for facts that disagree with themselves.
# Defensive: only fires on genuine contradiction (BOTH sides present), never on a single
# consistent mention. Read-only — emits warnings, changes nothing.
CORPUS_F="$TMP/corpus.txt"
jq -r '
  ( .variables.business
    | (.whyText // ""), (.importantText // ""),
      ((.overallPromptSections // [])[]? | .Body // "") ),
  ( .nodes[]? | select(.type=="Method") | (.data.Sections // [])[]? | .Body // "" ),
  ( .nodes[]? | select(.type=="Method") | .data.Instructions // "" ),
  ( .nodes[]? | select(.type=="MultiObjective") | (.data.Objectives // [])[]?
    | (.Instructions // .Description // .Body // "") )
' "$STEPS_F" > "$CORPUS_F"

CONTRA=""

# f1 — deposit contradiction: a "deposit required/needed" stance AND a "no deposit" stance
DEP_REQ=$(grep -icE '(\$[0-9]+[^.]*deposit[^.]*(required|needed|due|to (reserve|book|hold|secure)))|(deposit (is )?(required|needed|due))' "$CORPUS_F" || true)
DEP_NONE=$(grep -icE 'no deposit( is)?( required| needed)?|deposit[- ]free|without (a )?deposit|no upfront' "$CORPUS_F" || true)
if [ "${DEP_REQ:-0}" -gt 0 ] && [ "${DEP_NONE:-0}" -gt 0 ]; then
  CONTRA="${CONTRA}  ⚠ DEPOSIT CONTRADICTION: ${DEP_REQ} line(s) say a deposit IS required and ${DEP_NONE} say NO deposit. Pick one and make every node agree.
"
fi

# f2 — provider / injector contradiction: >1 distinct name after a Provider/Injector label.
# Label-anchored so we don't match arbitrary capitalized words. Strips trailing creds/notes.
# `|| true` on each grep so a no-match (rc 1) never trips `set -o pipefail`.
PROVIDERS="$( { grep -ioE '(provider|injector|your injector is|injected by|seen by)[:[:space:]]+(dr\.?[[:space:]]+)?[A-Z][a-z]+([[:space:]]+[A-Z][a-z]+)?' "$CORPUS_F" || true; } \
  | sed -E 's/^(provider|injector|your injector is|injected by|seen by)[:[:space:]]+//I' \
  | sed -E 's/^[Dd]r\.?[[:space:]]+//' \
  | sed -E 's/[[:space:]]+$//' \
  | { grep -ivE '^(certified|nurse|practitioner|the|our|your|a|team)$' || true; } \
  | { grep -ivE '^(confirm|confirms|will|shall|can|may|must|does|do|offer|offers|is|are|was|has|have)( |$)' || true; } \
  | sort -u)"
NPROV=$(printf '%s\n' "$PROVIDERS" | grep -c . || true)
if [ "${NPROV:-0}" -gt 1 ]; then
  CONTRA="${CONTRA}  ⚠ PROVIDER/INJECTOR CONTRADICTION: ${NPROV} distinct names across nodes: $(printf '%s' "$PROVIDERS" | paste -sd'; ' -). The bot will name different people to different leads.
"
fi

# f3 — booking-hours contradiction: >1 distinct hours statement (day-of-week + a clock time).
HOURS="$( { grep -ioE '(mon|tue|wed|thu|fri|sat|sun)[a-z]*([[:space:]]*[-–to]+[[:space:]]*(mon|tue|wed|thu|fri|sat|sun)[a-z]*)?[^.]*[0-9]{1,2}(:[0-9]{2})?[[:space:]]*(am|pm)' "$CORPUS_F" || true; } \
  | sed -E 's/[[:space:]]+/ /g; s/[[:space:]]+$//' \
  | sort -uf)"
NHRS=$(printf '%s\n' "$HOURS" | grep -c . || true)
if [ "${NHRS:-0}" -gt 1 ]; then
  CONTRA="${CONTRA}  ⚠ HOURS CONTRADICTION: ${NHRS} distinct business-hours statements across nodes:
$(printf '%s\n' "$HOURS" | sed 's/^/      • /')
"
fi

if [ -n "$CONTRA" ]; then
  printf '%s' "$CONTRA"
else
  echo "  ✓ no deposit / provider / hours contradictions detected across nodes"
fi

# (h) FRAMEWORK PARITY — is the recommended agent-node set present? A bot can be
# identity/offer/leak-clean yet STRUCTURALLY THIN (missing the core agents), which
# none of the other checks catch. This is the gap that let round-1 rebuilds ship without
# General Info Collection / Booking Agent / a deposit-or-readiness agent / Handle Pricing.
# Reference = your template bot (CB_TEMPLATE_BOT / cb.config.json templateBot). Titles can
# vary (Deposit Confirmation Agent vs Booking Readiness Agent are the deposit/no-deposit
# variants of the same stage), so match by intent. Missing any → the bot is NOT on the
# framework: splice it via closebot-apply-template (reference: your template bot).
FW_MISSING=""
fw_has_method()  { jq -e --arg t "$1" '[.nodes[]|select(.type=="Method" and ((.data.Title//"")|test($t;"i")))]|length>0' "$STEPS_F" >/dev/null 2>&1; }
fw_has_method "general info"            || FW_MISSING="${FW_MISSING}General Info Collection; "
fw_has_method "booking agent"          || FW_MISSING="${FW_MISSING}Booking Agent; "
fw_has_method "deposit|readiness"      || FW_MISSING="${FW_MISSING}Deposit/Booking-Readiness Agent; "
jq -e '[.nodes[]|select(.type=="MultiObjective")|(.data.Objectives//[])[]|select(((.Title//.Name//"")|test("pricing";"i")))]|length>0' "$STEPS_F" >/dev/null 2>&1 \
  || FW_MISSING="${FW_MISSING}Handle Pricing MultiObjective; "
if [ -n "$FW_MISSING" ]; then
  echo "  ⚠ FRAMEWORK GAP: missing recommended agent node(s): ${FW_MISSING%; }"
  echo "      → bot is not on the recommended framework; splice via closebot-apply-template (ref: $TEMPLATE_REF)"
else
  echo "  ✓ recommended agent-node set present (General Info Collection · Booking Agent · deposit/readiness · Handle Pricing)"
fi

# (i) LIBRARY ATTACHED BUT UNREADABLE — a real footgun (live 2026-06-24, bot_XXXXXXXXXXXXXXXX):
# library files ARE attached to one of the bot's sources, but a Method node has
# EnableLibraryContext=false, so the bot CANNOT read those files (e.g. pricing it was just
# given). EnableSmartFaq and EnableLibraryContext are SEPARATE retrieval paths — Smart-FAQ
# being on does NOT let the bot read a library FILE; that needs EnableLibraryContext=true.
# Check (c) only fires when BOTH flags are off; this fires the more common case where a file
# is attached yet the library path specifically is off on a node that should read it.
# Counts attached library files across ALL the bot's sources (same client-side filter as §11,
# since GET /library/files?sourceId= ignores the param). `|| true` keeps set -o pipefail safe.
ATTACHED_FILES=0
for SID in $(jq -r '.sources[]?.id' "$BOT_F"); do
  N="$(jq -r --arg s "$SID" '[ .[] | select(any(.sources[]?; .id==$s)) ] | length' "$LIB_F" 2>/dev/null || echo 0)"
  ATTACHED_FILES=$(( ATTACHED_FILES + N ))
done
if [ "$ATTACHED_FILES" -gt 0 ]; then
  LIBOFF="$(jq -r '.nodes[] | select(.type=="Method" and .data.EnableLibraryContext==false) |
    "  ⚠ Method \"\(.data.Title)\" has EnableLibraryContext=false but the bot has library file(s) attached → it CANNOT read them (Smart-FAQ ≠ library files; flip EnableLibraryContext=true)"' "$STEPS_F" 2>/dev/null || true)"
  if [ -n "$LIBOFF" ]; then
    echo "$LIBOFF"
  else
    echo "  ✓ library files attached and at least one Method node has EnableLibraryContext=true (KB is readable)"
  fi
fi

hr "13. PERSONA + VOICE CONFIG"
# The persona is the bot's PERSONALITY layer — name, voice styles, how-to-respond rules,
# typo/chunking behavior, response timing, provider order. It rides in the steps payload
# at .variables.persona, OUTSIDE the node tree.
#
# Why this section exists: every other scan here (§4–9, §12) walks nodes, so all of them
# are structurally blind to the persona. Three real failures live in this blind spot:
#   (j1) a duplicated bot is attached to NO persona → CloseBot returns
#        mostRecentFailureReason:"no_persona" and the agent NEVER replies, while every
#        node-level check still reports clean.
#   (j3) a shared persona's .description carries the ORIGINAL client's brand text — a
#        leak no node-level grep can see. (Heuristic: it flags any description sharing
#        no identity token with the bot, so a generic label trips it too.)
#   (j4) one persona is shared across many clients' bots, so a voice/howToRespond edit
#        silently changes every one of them.
#
# LINKAGE COMES FROM GET /persona, NOT THE STEPS PAYLOAD. The embedded
# .variables.persona block is a snapshot frozen when the version was saved; a duplicated
# bot carries its parent's snapshot forever. Verified live: a bot whose embedded snapshot
# claimed one linked bot was in fact attached via a persona listing five. Reading linkage
# from the payload produces fleet-wide false positives — (j2) reports that drift instead.
#
# Persona assignment is UI-ONLY (PUT /persona/{id} carries an irreversible default-flip), so
# this section REPORTS and never mutates. Read-only, like the rest of this script.

jq -r --arg b "$BOT_ID" '
  ([ .[] | select((.botIds // []) | index($b)) ] | first) as $p |
  if $p == null then
    "  (no persona in GET /persona lists this bot — see red flags below)"
  else
    "  persona id      : \($p.id)\n" +
    "  name            : \($p.personaName)\n" +
    "  description     : \($p.description // "(none)")\n" +
    "  voice styles    : \($p.voiceStyles // "(none)")\n" +
    "  typo percent    : \($p.typoPercent // 0)\n" +
    "  msg breakup %   : \($p.breakupLargeMessagePercent // 0)\n" +
    "  response timing : \($p.responseTime // "?") (delay \($p.responseDelay // 0))\n" +
    "  provider order  : \((($p.aiProviderPreferences // []) | join(", ")) | if .=="" then "(unpinned)" else . end)\n" +
    "  account default : \($p.default)   favorited: \($p.favorited)\n" +
    "  last modified   : \($p.modifiedAt // "?") by \($p.modifiedBy // "?")\n" +
    "  shared with     : \((($p.botIds // []) | length)) bot(s)\n" +
    (([$p.bots[]?.name] | map("      • " + .) | join("\n")) | if .=="" then "" else . + "\n" end) +
    "\n  --- howToRespond (the behavior prompt) ---\n" +
    (($p.howToRespond // "(empty)") | split("\n") | map("  " + .) | join("\n"))
  end' "$PERS_F"

echo
echo "  --- persona red flags ---"

# Linkage is resolved from GET /persona (authoritative). The steps payload's embedded
# .variables.persona is a stale save-time snapshot and must NOT be used for this.
LINKED_ID="$(jq -r --arg b "$BOT_ID" '([ .[] | select((.botIds // []) | index($b)) ] | first | .id) // ""' "$PERS_F")"

if [ -z "$LINKED_ID" ]; then
  # (j1) NO PERSONA — the bot cannot generate a reply at all.
  echo "  ⚠ NO PERSONA ATTACHED: no persona in GET /persona lists $BOT_ID in its botIds. CloseBot will return mostRecentFailureReason:\"no_persona\" and the agent will NOT reply. Assign in the UI — API assignment is unsafe (PUT /persona/{id} has an irreversible default-flip)."
  SNAP_ID="$(jq -r '(.variables.persona.id) // ""' "$STEPS_F")"
  SNAP_NAME="$(jq -r '(.variables.persona.personaName) // ""' "$STEPS_F")"
  if [ -n "$SNAP_ID" ]; then
    echo "      → this bot version still carries an INHERITED snapshot of persona $SNAP_ID (\"$SNAP_NAME\") from whichever bot it was duplicated from. That snapshot is cosmetic; it does not attach the persona."
  fi
else
  echo "  ✓ persona attached: $LINKED_ID"

  # (j2) EMBEDDED SNAPSHOT DRIFT — informational, explains confusing UI/payload reads.
  SNAP_ID="$(jq -r '(.variables.persona.id) // ""' "$STEPS_F")"
  if [ -n "$SNAP_ID" ] && [ "$SNAP_ID" != "$LINKED_ID" ]; then
    echo "  • embedded snapshot drift: this version's .variables.persona is $SNAP_ID but the live attachment is $LINKED_ID. The embedded block is frozen at save time — trust GET /persona, not the payload."
  fi

  # (j3) FOREIGN BRAND IN PERSONA DESCRIPTION — brand text carried over from another
  # client. Only the description is checked: bots[].name legitimately lists every bot a
  # SHARED persona serves, so scanning it would fire on normal multi-client sharing.
  FOREIGN="$(jq -r --slurpfile bot "$BOT_F" --arg b "$BOT_ID" '
    ($bot[0]) as $bb |
    ([ .[] | select((.botIds // []) | index($b)) ] | first) as $p |
    (["agent","bot","bots","the","and","for","with","from","new","copy","test","demo",
      "draft","drafted","client","actual","main","live","prod","clone","template",
      "default","assistant","persona","updated","offers","all"]) as $stop |
    def toks($t): ($t // "") | ascii_downcase | [scan("[a-z0-9]{3,}")] | unique
      | map(select(. as $w | $stop | index($w) | not));
    (toks(($bb.name // "") + " " + ([$bb.sources[]?.name] | join(" ")))) as $own |
    (toks($p.description)) as $d |
    if (($d | length) > 0) and (($d - $own) == $d)
    then "  ⚠ PERSONA DESCRIPTION MISMATCH: description = \"\($p.description)\" shares no identity token with this bot (\($bb.name)) — either leftover branding from the bot this persona was built for, or a generic label. Persona text is invisible to node-level scans; confirm it in the UI."
    else empty end
  ' "$PERS_F" 2>/dev/null || true)"
  [ -n "$FOREIGN" ] && echo "$FOREIGN" || echo "  ✓ persona description matches this bot's identity"

  # (j4) voice-config settings worth a second look (not errors — surfaced deliberately).
  jq -r --arg b "$BOT_ID" '
    ([ .[] | select((.botIds // []) | index($b)) ] | first) as $p |
    ( if ($p.typoPercent // 0) > 0 then "  • typoPercent=\($p.typoPercent) — the bot injects deliberate typos" else empty end ),
    ( if (($p.aiProviderPreferences // []) | length) == 0 then "  • no aiProviderPreferences set — provider order is unpinned" else empty end ),
    ( if ($p.default // false) then "  • this persona is the ACCOUNT DEFAULT — PUT /persona/{id} on it carries an irreversible default-flip" else empty end ),
    ( if (($p.botIds // []) | length) > 1 then "  • persona is SHARED by \(($p.botIds // []) | length) bots — editing voice/howToRespond changes EVERY one of them, across clients" else empty end )
  ' "$PERS_F"
fi

echo
echo "=== END VIEW for $BOT_ID @ $VER ==="
echo "Read-only (Tier 0). To change anything, use closebot-edit-job-flow; to publish, closebot-publish-safely."
