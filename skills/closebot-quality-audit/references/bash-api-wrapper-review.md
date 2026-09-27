# Bash API-Wrapper Script Review Checklist

Derived from reviewing three in-house bash wrappers (KB read, flow read, and
KB/flow update scripts) around the CloseBot API (2026-07-06). 8 bugs found across 3 scripts — every one fit
one of the categories below. Run this checklist when reviewing any bash script
that wraps a REST API with curl + jq.

## 1. HTTP status validation

**Pattern:** Scripts that POST/PUT/DELETE often print the HTTP code via
`-w "%{http_code}"` but never **branch** on it. A 401 or 500 still prints "✓".

**Check:** grep for `-w "%{http_code}"` — every occurrence should be captured
into a variable and validated:

```bash
# BAD — prints code, always prints ✓
curl -s -X POST ... -o /dev/null -w "%{http_code}\n"
echo "✓ Done"

# GOOD — captures, validates, exits on failure
HTTP_CODE=$(curl -s -X POST ... -o /dev/null -w "%{http_code}")
if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "✓ Done (HTTP $HTTP_CODE)"
else
  echo "ERROR: failed (HTTP $HTTP_CODE)" >&2; exit 1
fi
```

## 2. Array-type guards before jq formatting

**Pattern:** `curl ... | jq -r '.[] | ...'` crashes with
`Cannot index string with string "answer"` if the API returns a non-array
(error object, 401 JSON, HTML error page).

**Check:** every `curl | jq '.[]` pipeline needs a type guard:

```bash
# BAD — crashes on non-array response
curl -s "$API/endpoint" | jq -r '.[] | "..."'

# GOOD — guard before formatting
RESP=$(curl -s "$API/endpoint")
echo "$RESP" | jq -e 'type=="array"' >/dev/null 2>&1 || { echo "ERROR" >&2; exit 1; }
echo "$RESP" | jq -r '.[] | "..."'
```

## 3. Null-guards in jq programs

**Pattern:** `.field|length` works on jq 1.7 when field is null (returns 0),
but is fragile. `// []` and `// ""` guards make intent explicit and work
across jq versions.

**Check:** every `|length` in a jq program should have a `//` fallback:

```bash
# FRAGILE
if (.overallPromptSections|length)>0 then ...

# ROBUST
if ((.overallPromptSections // []) | length) > 0 then ...
```

## 4. Dead / unused variables

**Pattern:** A `case` or `if` sets a variable that's passed to jq via
`--argjson` but the jq program never references it. Dead code that confuses
future readers and can produce invalid JSON if the value isn't valid JSON.

**Check:** for every `--arg`/`--argjson` in a jq invocation, grep the jq
program string for the variable name. If absent, it's dead.

## 5. 404 / error detection patterns

**Pattern:** Checking `[ "$RESP" == "404" ]` only catches the literal string
"404". APIs return JSON errors like `{"statusCode":404,"message":"Not Found"}`.

**Check:** use `jq -e` for structured 404 detection:

```bash
# BAD — misses JSON 404 responses
if [ "$VIEW" == "404" ]; then ...

# GOOD — detects JSON 404
if echo "$VIEW" | jq -e '.statusCode == 404' >/dev/null 2>&1; then ...
```

## 6. Version resolution consistency

**Pattern:** When two scripts in the same repo resolve "latest version"
differently, one is vulnerable to the stale-draft gotcha.

**Check:** grep for `.versions` in all scripts. They should ALL use:

```bash
.versions | sort_by(.version | split(".") | map(tonumber)) | last | .version
```

Never `map(select(.published==false)) | last` — that resurrects stale drafts
on published-head bots (CloseBot GOTCHAS 2026-07-02).

## 7. Silent boolean coercion

**Pattern:** `[ "$VAL" == "true" ] && FB=true || FB=false` silently coerces
ANY non-"true" string (including "True", "TRUE", "yes", typos) to false.

**Check:** replace with explicit `case` validation:

```bash
case "$FLAG_VAL" in
  true|false) ;;
  *) echo "ERROR: must be true/false, got '$FLAG_VAL'" >&2; exit 1 ;;
esac
```

## 8. Non-JSON response guards

**Pattern:** `echo "$RESP" | jq .` crashes if the response is an HTML error
page or empty string. `jq '.field | length'` also crashes.

**Check:** before any `jq` on a response variable, add a type guard:

```bash
echo "$RESP" | jq -e 'type=="object"' >/dev/null 2>&1 || { echo "ERROR" >&2; exit 1; }
```

## Review procedure

1. `bash -n script.sh` — syntax check first
2. Read the script top to bottom, checking each category above
3. Run all read-only modes against a live target (e.g. `acme`)
4. Verify output is non-empty and well-formed for each mode
5. For mutation modes, trace the code path without executing — check HTTP
   status validation and error exits
6. Cross-reference SKILL.md gotchas table against this repo's
   GOTCHAS.md — every repo gotcha that applies should be reflected
7. Log new gotchas to the repo's GOTCHAS.md
