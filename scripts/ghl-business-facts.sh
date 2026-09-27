#!/usr/bin/env bash
# ghl-business-facts.sh — resolve a CloseBot bot/source to its GHL sub-account and
# dump the real business facts you need to populate a bot's "Job Information"
# (business name, address, phone, email, website, staff/admins, key custom values).
#
# This exists because populating a CloseBot bot for a real client means knowing the
# client's actual address/phone/provider — and that data lives in GHL, not CloseBot.
# Doing it by hand means: find the location, get a location-scoped token, hit three
# GHL endpoints. This script does all of that.
#
# Usage:
#   bash scripts/ghl-business-facts.sh bot_XXXXXXXXXXXXXXXX   # resolve via CloseBot bot
#   bash scripts/ghl-business-facts.sh src_XXXXXXXXXXXXXXXX   # resolve via CloseBot source
#   bash scripts/ghl-business-facts.sh <LOCATION_ID>   # raw GHL location id
#   bash scripts/ghl-business-facts.sh bot_... --json         # machine-readable bundle
#
# Requires: curl, jq. Reads CLOSEBOT_API_KEY from ./.env (for bot/source resolution).
# GHL auth, first match wins (both can live in ./.env):
#   GHL_TOKEN                      a location-scoped token for that sub-account
#                                  (a GHL Private Integration Token, or an OAuth location token)
#   GHL_BROKER_URL + GHL_BROKER_KEY  an OAuth token broker you run that answers
#                                  POST $GHL_BROKER_URL/location-token {locationId} → {access_token}
# Agency-level tokens do NOT work on location endpoints — the token must be scoped to
# the location (a token for location A 401s on location B).
#
# Exit codes: 0 ok · 2 bad input / missing deps · 3 could not resolve location
#             4 GHL access failed

set -u
# Parse args: one positional target (bot_/src_/locationId) + optional --json in any position.
ARG=""; JSON_OUT=0
for a in "$@"; do
  case "$a" in
    --json) JSON_OUT=1 ;;
    -*)     ;;  # ignore unknown flags rather than treating them as the target
    *)      [ -z "$ARG" ] && ARG="$a" ;;
  esac
done

GRAY="\033[90m"; GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; BOLD="\033[1m"; NC="\033[0m"
die() { echo -e "${RED}✗ $*${NC}" >&2; exit "${2:-2}"; }
note() { [ "$JSON_OUT" -eq 0 ] && echo -e "$*" >&2; }

command -v jq  >/dev/null || die "jq not installed" 2
command -v curl >/dev/null || die "curl not installed" 2
[ -n "$ARG" ] || die "usage: ghl-business-facts.sh <bot_… | src_… | locationId> [--json]" 2

# --- load CloseBot key (only needed to resolve bot_/src_ inputs) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$SCRIPT_DIR/.env" ] && set -a && . "$SCRIPT_DIR/.env" && set +a
# Plugin installs keep config in the user-level dir (cb init --global).
CB_CONFIG_DIR="${CLOSEBOT_CONFIG_DIR:-${HOME:-}/.config/closebot}"
[ -z "${CLOSEBOT_API_KEY:-}" ] && [ -f "$CB_CONFIG_DIR/.env" ] && set -a && . "$CB_CONFIG_DIR/.env" && set +a
CB="${CLOSEBOT_API_KEY:-}"
REST="https://api.closebot.com"

# --- GHL auth ---
BURL="${GHL_BROKER_URL:-}"; BKEY="${GHL_BROKER_KEY:-}"
[ -n "${GHL_TOKEN:-}" ] || { [ -n "$BURL" ] && [ -n "$BKEY" ]; } \
  || die "set GHL_TOKEN (location-scoped token) or GHL_BROKER_URL + GHL_BROKER_KEY in ./.env" 4

# --- 1. resolve input → GHL locationId ---
LOC=""
case "$ARG" in
  bot_*)
    [ -n "$CB" ] || die "CLOSEBOT_API_KEY needed to resolve a bot id (set it in ./.env)" 2
    note "${GRAY}Resolving bot $ARG → GHL location via its CloseBot source…${NC}"
    LOC=$(curl -s -H "X-CB-KEY: $CB" "$REST/bot/$ARG" \
      | jq -r '[.sources[]? | select(.category=="GHL") | .key] | first // empty')
    ;;
  src_*)
    [ -n "$CB" ] || die "CLOSEBOT_API_KEY needed to resolve a source id (set it in ./.env)" 2
    note "${GRAY}Resolving source $ARG → GHL location…${NC}"
    LOC=$(curl -s -H "X-CB-KEY: $CB" "$REST/agency/source" \
      | jq -r --arg s "$ARG" '[.[] | select(.id==$s and .category=="GHL") | .key] | first // empty')
    ;;
  *) LOC="$ARG" ;;  # assume raw locationId
esac
[ -n "$LOC" ] && [ "$LOC" != "null" ] || die "could not resolve a GHL location from '$ARG'" 3
note "${GREEN}✓ GHL location:${NC} $LOC"

# --- 2. get a location-scoped token ---
if [ -n "${GHL_TOKEN:-}" ]; then
  TOK="$GHL_TOKEN"
else
  TOK=$(curl -s -X POST -H "Authorization: Bearer $BKEY" -H "Content-Type: application/json" \
          -d "{\"locationId\":\"$LOC\"}" "$BURL/location-token" | jq -r '.access_token // empty')
  # A blank token usually means the broker's installed-locations list is stale or the
  # OAuth app is not installed on this sub-account — refresh the broker, then re-run.
  [ -n "$TOK" ] || die "broker returned no token for $LOC (app not installed on this sub-account, or the broker's install list is stale)" 4
fi

GHL="https://services.leadconnectorhq.com"
gh() { curl -s "$GHL$1" -H "Authorization: Bearer $TOK" -H "Version: 2021-07-28" -H "Accept: application/json"; }

# --- 3. pull the three things that matter ---
LOCJSON=$(gh "/locations/$LOC")
USERSJSON=$(gh "/users/?locationId=$LOC")
CVJSON=$(gh "/locations/$LOC/customValues")

# sanity: did the location call actually return a location?
echo "$LOCJSON" | jq -e '.location' >/dev/null 2>&1 \
  || die "GHL rejected the token for $LOC: $(echo "$LOCJSON" | jq -rc '.message? // .')" 4

if [ "$JSON_OUT" -eq 1 ]; then
  jq -n --argjson loc "$LOCJSON" --argjson users "$USERSJSON" --argjson cv "$CVJSON" --arg id "$LOC" '{
    locationId: $id,
    business: ($loc.location | {name, address, city, state, postalCode, country, phone, email, website, timezone}),
    staff: [ $users.users[]? | {name: ((.firstName // "") + " " + (.lastName // "")) | gsub("^ | $";""), email, role: .roles.role} ],
    customValues: [ $cv.customValues[]? | select(.value != null) | {name, value} ]
  }'
  exit 0
fi

# --- pretty report ---
echo ""
echo -e "${BOLD}Business${NC}"
echo "$LOCJSON" | jq -r '.location | "  Name:    \(.name // "—")\n  Address: \(.address // "—"), \(.city // "")  \(.state // "") \(.postalCode // "")\n  Phone:   \(.phone // "—")\n  Email:   \(.email // "—")\n  Website: \(.website // "—")\n  TZ:      \(.timezone // "—")"'
echo ""
echo -e "${BOLD}Staff (GHL users)${NC}"
echo "$USERSJSON" | jq -r '(.users // []) | if length==0 then "  (none / no access)" else (.[] | "  \((.firstName // "") + " " + (.lastName // "")) — \(.email // "—") [\(.roles.role // "?")]") end'
echo ""
echo -e "${BOLD}Key custom values${NC} ${GRAY}(populated only)${NC}"
echo "$CVJSON" | jq -r '[(.customValues // [])[] | select(.value != null)] | if length==0 then "  (none populated)" else (.[] | "  \(.name): \(.value)") end'
echo ""
note "${GRAY}Tip: add --json for a machine-readable bundle you can feed straight into a bot edit.${NC}"
