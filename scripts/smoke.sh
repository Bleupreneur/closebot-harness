#!/usr/bin/env bash
# CloseBot smoke test — confirms $CLOSEBOT_API_KEY authenticates against live APIs
# and that documented endpoints respond as expected. READ-ONLY — no mutations.
#
# Usage (any of these works):
#   bash scripts/smoke.sh                    # auto-loads ./.env if present
#   export CLOSEBOT_API_KEY=...; bash scripts/smoke.sh
#
# Exit codes:
#   0 — all checks passed (key works, all surfaces reachable)
#   1 — at least one check failed
#   2 — env var missing or pre-flight failed

set -u
REST="https://api.closebot.com"
LIVE="https://api.closebot.ai"
PASS=0
FAIL=0
GRAY="\033[90m"; GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; NC="\033[0m"

# Auto-load project-level .env (preferred) or fall back to whatever is already exported.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
# Paths below (schema/, cli/) are relative to the harness root; run from there whatever the cwd.
cd "$SCRIPT_DIR/.." || exit 2
# Repo .env (folder mode), then the user-level config (plugin installs: cb init --global).
CB_CONFIG_DIR="${CLOSEBOT_CONFIG_DIR:-${HOME:-}/.config/closebot}"
for ENV_FILE in "$SCRIPT_DIR/../.env" "$CB_CONFIG_DIR/.env"; do
  if [[ -z "${CLOSEBOT_API_KEY:-}" && -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    echo -e "${GRAY}↻ loaded $ENV_FILE${NC}"
  fi
done
# Sandbox allowlist: CB_SANDBOX_FILE, cli/sandbox.json, then the user-level sandbox.json.
SB_FILE="${CB_SANDBOX_FILE:-cli/sandbox.json}"
[[ -z "${CB_SANDBOX_FILE:-}" && ! -f "$SB_FILE" && -f "$CB_CONFIG_DIR/sandbox.json" ]] && SB_FILE="$CB_CONFIG_DIR/sandbox.json"

if [[ -z "${CLOSEBOT_API_KEY:-}" ]]; then
  echo -e "${RED}✗ CLOSEBOT_API_KEY is not set.${NC}"
  echo "  Quick start:"
  echo "    cp .env.example .env"
  echo "    chmod 600 .env"
  echo "    edit .env and paste your key"
  echo ""
  echo "  Or export inline:  export CLOSEBOT_API_KEY=\"cb_...\""
  echo "  Generate at:       https://app.closebot.com/settings?tab=keys"
  exit 2
fi

# Spec drift pre-check (offline if upstream is down — non-blocking)
echo -e "${GRAY}── Spec drift check ──${NC}"
UPSTREAM=$(mktemp "${TMPDIR:-/tmp}/closebot-upstream.XXXXXX") || exit 2
trap 'rm -f "$UPSTREAM"' EXIT
if curl -fsSL --max-time 10 "https://megastream25-api.closebot.com/swagger/v1/swagger.json" -o "$UPSTREAM" 2>/dev/null; then
  if diff -q "$UPSTREAM" schema/openapi.json >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} schema/openapi.json in sync with upstream Swagger"
  else
    echo -e "${YELLOW}⚠${NC} upstream Swagger differs from local schema/openapi.json — run: cli/cb spec refresh"
  fi
else
  echo -e "${YELLOW}⚠${NC} upstream Swagger unreachable (skipping drift check)"
fi

check () {
  local label="$1"; local method="$2"; local url="$3"; local expect="$4"; shift 4
  local code
  # Key is read from a process-substitution fd, not argv (argv is visible in `ps`).
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$url" \
    -H @<(printf 'X-CB-KEY: %s\n' "$CLOSEBOT_API_KEY") -H "Content-Type: application/json" \
    --max-time 15 "$@" 2>/dev/null || echo "000")
  if [[ ",$expect," == *",$code,"* ]]; then
    echo -e "${GREEN}✓${NC} $label ${GRAY}($method ${url##*closebot.???} → $code)${NC}"
    PASS=$((PASS+1))
  else
    echo -e "${RED}✗${NC} $label ${GRAY}($method ${url##*closebot.???} → $code, expected $expect)${NC}"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo -e "${GRAY}── REST management API ──${NC}"
check "auth (list api keys)"   GET    "$REST/account/apiKey"             "200"
check "agency present"          GET    "$REST/agency/current"             "200"
check "source list"             GET    "$REST/agency/source"              "200,204"
check "bot list"                GET    "$REST/bot"                        "200,204"
check "billing balance"         GET    "$REST/agency/billing/balance"     "200"
check "lead list"               GET    "$REST/lead"                       "200,204"
check "library files"           GET    "$REST/library/files"              "200,204"
check "node descriptors"        GET    "$REST/bot/nodeDescriptors"        "200"

echo ""
echo -e "${GRAY}── Live Message API (validation only — no real send) ──${NC}"
# Observed: account resolution happens BEFORE id/body validation, so empty body returns 410 in
# practice (not 430 as upstream docs claim). Accept both — see docs/04-error-codes.md.
# The body is empty on purpose: with no contact id there is nothing to message. Never send an `id`
# from smoke: a made-up id can resolve to a real contact and trigger a real reply (docs/SAFETY.md).
check "live-message reachable" POST   "$LIVE/message"                    "410,430" -d '{}'

echo ""
TOTAL=$((PASS+FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}All $TOTAL checks passed.${NC} The package is wired up and your key works."
else
  echo -e "${RED}$FAIL of $TOTAL checks failed.${NC}  ${PASS} passed."
  echo "If 'auth (list api keys)' failed with 401, your CLOSEBOT_API_KEY is invalid or revoked."
  echo "If 'live-message reachable' failed with 0 or 5xx, the live endpoint may be down."
  exit 1
fi

# ── Write-mode round trip (only with --write; only against cli/sandbox.json ids) ──
if [[ "${1:-}" == "--write" ]]; then
  echo -e "${GRAY}── Write-mode round trip (sandbox only) ──${NC}"
  [[ -f "$SB_FILE" ]] || { echo -e "${RED}✗${NC} $SB_FILE missing — run cb init --sandbox (plugin: cb init --global --sandbox) and fill in your sandbox bot/source ids"; exit 1; }
  SB=$(jq -r '.bots[0] // empty' "$SB_FILE")
  [[ -n "$SB" && "$SB" != *XXXX* ]] || { echo -e "${RED}✗${NC} $SB_FILE has no real sandbox bot id (still the placeholder?)"; exit 1; }
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP" "$UPSTREAM"' EXIT
  cli/cb bot pull "$SB" --out "$TMP/steps.json" >/dev/null || { echo -e "${RED}✗${NC} pull"; exit 1; }
  MARK="[CB-SANDBOX smoke $(date +%s)]"
  jq --arg m "$MARK" '(.nodes[] | select(.type=="Method") | .data.Instructions) |= ($m + " " + .)' "$TMP/steps.json" > "$TMP/mut.json"
  OUT=$(cli/cb bot push "$SB" "$TMP/mut.json") || { echo -e "${RED}✗${NC} push: $OUT"; exit 1; }
  echo -e "${GREEN}✓${NC} push landed $(echo "$OUT" | jq -r .savedVersion)"
  cli/cb bot push "$SB" "$TMP/steps.json" >/dev/null && echo -e "${GREEN}✓${NC} restored original instructions" || { echo -e "${RED}✗${NC} restore failed — sandbox draft still carries the smoke marker"; exit 1; }
  PUB=$(cli/cb bot version "$SB" | jq -r '.targetPublished'); [[ "$PUB" == "false" ]] && echo -e "${GREEN}✓${NC} sandbox still unpublished" || { echo -e "${RED}✗${NC} sandbox shows published!"; exit 1; }
  if [[ $(jq '.sources|length' "$SB_FILE") -gt 0 ]]; then
    SRC=$(jq -r '.sources[0]' "$SB_FILE"); mkdir -p "$TMP/kb"; echo "smoke $MARK" > "$TMP/kb/smoke.txt"
    cli/cb kb build --source "$SRC" --from "$TMP/kb" >/dev/null && echo -e "${GREEN}✓${NC} kb build+attach+verify"
  else
    echo -e "${YELLOW}⚠${NC} kb write test skipped: $SB_FILE .sources is empty (source creation is OAuth-only)"
  fi
fi

exit 0
