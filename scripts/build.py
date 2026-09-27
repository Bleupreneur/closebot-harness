#!/usr/bin/env python3
"""
CloseBot package build — synthesizes all derived artifacts from schema/openapi.json.

Outputs:
  schema/openapi.yaml             (YAML form of master spec)
  schema/endpoints.index.json     (flat agent-friendly index)
  schema/live-message.json        (hand-built fragment for api.closebot.ai/message)
  cli/closebot-cli.spec.yaml      (CLI command spec, 1:1 with endpoints)
  docs/endpoints/<tag>.md         (per-domain markdown reference)

Run from repo root:  python3 scripts/build.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
SPEC_PATH = ROOT / "schema" / "openapi.json"
SCHEMA_DIR = ROOT / "schema"
DOCS_DIR = ROOT / "docs" / "endpoints"
CLI_DIR = ROOT / "cli"

REST_BASE = "https://api.closebot.com"
MESSAGE_BASE = "https://api.closebot.ai"
INCOMPLETE = "[INCOMPLETE]"

HTTP_METHODS = {"get", "post", "put", "delete", "patch"}

# Ops CloseBot removed upstream, keyed by the tag doc that used to list them.
# Rendered as a pointer so old links/playbooks land somewhere useful.
MOVED_OPS = {
    "BotMetric": [
        ("GET /botMetric/leaderboard", "GET /leaderboard/board", "leaderboard.md"),
        ("GET /botMetric/localleaderboard", "GET /leaderboard/board", "leaderboard.md"),
    ],
}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def load_spec() -> dict[str, Any]:
    return json.loads(SPEC_PATH.read_text())


def write_yaml(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False, width=120))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def iter_operations(spec: dict[str, Any]):
    for path, item in spec.get("paths", {}).items():
        for method, op in item.items():
            if method.lower() not in HTTP_METHODS:
                continue
            yield path, method.lower(), op


def resolve_ref(spec: dict[str, Any], ref: str) -> dict[str, Any] | None:
    if not ref.startswith("#/"):
        return None
    parts = ref[2:].split("/")
    cur: Any = spec
    for p in parts:
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def schema_name_from_ref(ref: str | None) -> str | None:
    if not ref:
        return None
    return ref.rsplit("/", 1)[-1]


def primary_response_schema(op: dict[str, Any]) -> str | None:
    responses = op.get("responses") or {}
    for code in ("200", "201", "default"):
        r = responses.get(code)
        if not r:
            continue
        content = r.get("content") or {}
        for ct in ("application/json", "text/json", "application/*+json"):
            sch = content.get(ct, {}).get("schema") or {}
            ref = sch.get("$ref") or (sch.get("items") or {}).get("$ref")
            if ref:
                return schema_name_from_ref(ref)
    return None


def request_body_schema(op: dict[str, Any]) -> str | None:
    rb = op.get("requestBody") or {}
    content = rb.get("content") or {}
    for ct in ("application/json", "text/json", "application/*+json"):
        sch = content.get(ct, {}).get("schema") or {}
        ref = sch.get("$ref") or (sch.get("items") or {}).get("$ref")
        if ref:
            return schema_name_from_ref(ref)
    return None


def operation_summary(op: dict[str, Any]) -> str:
    return op.get("summary") or op.get("operationId") or op.get("description", "").split("\n")[0] or ""


def primary_tag(op: dict[str, Any]) -> str:
    tags = op.get("tags") or []
    return tags[0] if tags else "Untagged"


# ---------- 1. openapi.yaml ----------
def emit_openapi_yaml(spec: dict[str, Any]) -> None:
    write_yaml(SCHEMA_DIR / "openapi.yaml", spec)


# ---------- 2. endpoints.index.json ----------
def load_probed() -> set[str] | None:
    """Optional schema/probed.json: {"probed": ["GET /bot", ...]}. Ops not listed are
    marked [UNPROBED] (probed: false) in the index. Absent file = probed flag omitted
    entirely (back-compat / no-op when the file hasn't been seeded yet)."""
    probed_path = SCHEMA_DIR / "probed.json"
    if not probed_path.exists():
        return None
    return set(json.loads(probed_path.read_text()).get("probed", []))


def emit_endpoints_index(spec: dict[str, Any]) -> None:
    probed = load_probed()
    rows = []
    for path, method, op in iter_operations(spec):
        row = {
            "id": op.get("operationId") or f"{method}_{slug(path)}",
            "method": method.upper(),
            "path": path,
            "tag": primary_tag(op),
            "summary": operation_summary(op),
            "auth": "X-CB-KEY",
            "request_body": request_body_schema(op),
            "response_schema": primary_response_schema(op),
        }
        if probed is not None:
            row["probed"] = f"{method.upper()} {path}" in probed
        rows.append(row)
    rows.sort(key=lambda r: (r["tag"], r["path"], r["method"]))
    # Add the live-message endpoint (separate API surface) — always probed: proven live by smoke.sh.
    live_message_row = {
        "id": "send_live_message",
        "method": "POST",
        "path": "/message",
        "tag": "LiveMessage",
        "summary": "Send a message to a CloseBot conversation (live, not REST)",
        "auth": "X-CB-KEY (optional when integrated with GHL)",
        "request_body": "MessagePayload",
        "response_schema": None,
        "base_url": MESSAGE_BASE,
    }
    if probed is not None:
        live_message_row["probed"] = True
    rows.append(live_message_row)
    write_json(SCHEMA_DIR / "endpoints.index.json", rows)


# ---------- 3. live-message.json (hand-built fragment) ----------
def emit_live_message_spec() -> None:
    fragment = {
        "openapi": "3.0.1",
        "info": {
            "title": "CloseBot Live Message API",
            "version": "1.0",
            "description": (
                "Standalone live messaging endpoint, separate from the REST management API. "
                "Drives bot conversations. Documented at https://closebot.readme.io/reference. "
                "When the contact is already integrated with the GHL CRM source, api_key is "
                "optional; otherwise X-CB-KEY (or body api_key) is required."
            ),
        },
        "servers": [
            {"url": "https://api.closebot.ai", "description": "Primary"},
            {"url": "https://xljmafyych.execute-api.us-west-2.amazonaws.com", "description": "AWS Lambda backing"},
        ],
        "components": {
            "securitySchemes": {
                "Key": {"type": "apiKey", "name": "X-CB-KEY", "in": "header"},
            },
            "schemas": {
                "MessagePayload": {
                    "type": "object",
                    "required": ["id"],
                    "properties": {
                        "id": {"type": "string", "description": "Contact identifier for conversation tracking"},
                        "api_key": {"type": "string", "description": "Required unless integrated with GoHighLevel CRM"},
                        "@rep_name": {"type": "string", "description": "Bot's self-identification name"},
                        "@lead_name": {"type": "string", "description": "Contact's first name"},
                        "message": {"type": "string", "description": "Message requiring response"},
                        "goals_finished": {"type": "array", "items": {"type": "string"}, "description": "Pre-completed goals to skip"},
                        "limit": {"type": "integer", "format": "int32", "default": 100, "description": "Max processing attempts per contact"},
                        "extra_prompt": {"type": "string", "maxLength": 500, "description": "Additional instructions (<=500 chars)"},
                        "bot": {"type": "integer", "format": "int32", "nullable": True, "description": "Bot ID (earliest if unspecified)"},
                        "model": {"type": "string", "default": "text-davinci-003", "enum": ["text-davinci-003", "gpt-4", "gpt-4-1106-preview"]},
                        "followup": {"type": "boolean", "default": False, "description": "Process followup instead of reply"},
                        "is_update": {"type": "boolean", "default": False, "description": "Update memory vs. generate reply"},
                        "character_limit": {"type": "integer", "format": "int32", "default": 225, "description": "Output character maximum"},
                        "delay": {"type": "integer", "format": "int32", "default": 0, "description": "Processing delay (seconds)"},
                        "channel": {"type": "string", "enum": ["Live_Chat", "SMS", "FB", "Email", "IG", "WhatsApp"], "description": "Override channel"},
                    },
                    "additionalProperties": {
                        "type": "string",
                        "description": "Custom variables prefixed with @ (e.g. @example_variable) are accepted and injected into the prompt",
                    },
                },
            },
        },
        "paths": {
            "/message": {
                "post": {
                    "operationId": "send_live_message",
                    "summary": "Send a message to a CloseBot conversation",
                    "tags": ["LiveMessage"],
                    "security": [{"Key": []}],
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/MessagePayload"}}},
                    },
                    "responses": {
                        "200": {"description": "OK (No integration) — message processed, bot response returned"},
                        "201": {"description": "Rerun — another message arrived during processing; client should retry"},
                        "410": {"description": "No Account — the resolved account is missing"},
                        "420": {"description": "No Credits — account has insufficient credits"},
                        "430": {"description": "No ID — id field missing from request"},
                        "440": {"description": "No Message Body — message field missing"},
                        "450": {"description": "Bot Limit Reached — bot processed maximum allowed messages for this contact"},
                        "460": {"description": f"Account Limit — {INCOMPLETE} exact threshold not documented"},
                    },
                },
            },
        },
    }
    write_json(SCHEMA_DIR / "live-message.json", fragment)


# ---------- 4. cli/closebot-cli.spec.yaml ----------
def operation_command_name(op: dict[str, Any], path: str, method: str) -> str:
    op_id = op.get("operationId")
    if op_id:
        # strip tag prefix if present (FooController_getBar → getBar)
        base = re.sub(r".*_", "", op_id)
        return slug(base)
    last = [seg for seg in path.split("/") if seg and not seg.startswith("{")][-1] if any(seg and not seg.startswith("{") for seg in path.split("/")) else "root"
    return f"{method}-{slug(last)}"


def collect_args(spec: dict[str, Any], op: dict[str, Any]) -> list[dict[str, Any]]:
    args: list[dict[str, Any]] = []
    seen = set()
    for p in op.get("parameters", []) or []:
        if isinstance(p, dict) and "$ref" in p:
            p = resolve_ref(spec, p["$ref"]) or {}
        if not isinstance(p, dict):
            continue
        name = p.get("name")
        if not name or name in seen:
            continue
        seen.add(name)
        sch = p.get("schema") or {}
        args.append({
            "name": name,
            "in": p.get("in"),
            "required": bool(p.get("required")),
            "type": sch.get("type") or sch.get("format") or "string",
            "doc": (p.get("description") or "").strip().splitlines()[0] if p.get("description") else None,
        })
    return args


def emit_cli_spec(spec: dict[str, Any]) -> None:
    cli: dict[str, Any] = {
        "name": "closebot",
        "version": "1.0.0",
        "description": "CloseBot.ai CLI — agent-native, mirrors the REST + Live Message API.",
        "auth": {"env": "CLOSEBOT_API_KEY", "header": "X-CB-KEY"},
        "base_urls": {"rest": REST_BASE, "message": MESSAGE_BASE},
        "global_flags": [
            # No --key flag: it would collide with the `key` PATH parameter that 8
            # livedemo endpoints take (e.g. GET /bot-live-demo/live/{key}), silently
            # interpolating the API key into the request URL. Auth is env/`.env` only.
            {"name": "--json", "doc": "Output raw JSON (default: pretty)"},
            {"name": "--dry-run", "doc": "Print the request without sending"},
            {"name": "--confirm", "doc": "Required to run a Tier 2 operation (DELETE, publish, billing refills)"},
            {"name": "--unsafe-raw", "doc": "Skip redaction/projection; prints raw token fields and raw source rows"},
        ],
        "commands": {},
    }

    by_tag: dict[str, dict[str, Any]] = {}
    for path, method, op in iter_operations(spec):
        tag = primary_tag(op)
        group = by_tag.setdefault(tag, {})
        cmd = operation_command_name(op, path, method)
        # disambiguate duplicates
        base_cmd = cmd
        i = 2
        while cmd in group:
            cmd = f"{base_cmd}-{i}"
            i += 1
        group[cmd] = {
            "method": method.upper(),
            "path": path,
            "summary": operation_summary(op),
            "args": collect_args(spec, op),
            "request_body": request_body_schema(op),
            "response": primary_response_schema(op),
            "example": f"closebot {slug(tag)} {cmd}" + (
                " --id <uuid>" if "{id}" in path or "{botId}" in path else ""
            ),
        }

    # add Live Message
    by_tag["LiveMessage"] = {
        "send": {
            "method": "POST",
            "base": "message",
            "path": "/message",
            "summary": "Send a message to a CloseBot conversation",
            "request_body": "MessagePayload",
            "args": [
                {"name": "id", "required": True, "type": "string", "doc": "Contact identifier"},
                {"name": "message", "required": False, "type": "string"},
                {"name": "bot", "required": False, "type": "integer"},
                {"name": "model", "required": False, "type": "string", "enum": ["gpt-4", "gpt-4-1106-preview", "text-davinci-003"]},
                {"name": "channel", "required": False, "type": "string", "enum": ["Live_Chat", "SMS", "FB", "Email", "IG", "WhatsApp"]},
                {"name": "followup", "required": False, "type": "boolean"},
                {"name": "is_update", "required": False, "type": "boolean"},
                {"name": "character_limit", "required": False, "type": "integer"},
                {"name": "extra_prompt", "required": False, "type": "string", "doc": "<=500 chars"},
                {"name": "delay", "required": False, "type": "integer"},
                {"name": "limit", "required": False, "type": "integer"},
                {"name": "@rep_name", "required": False, "type": "string"},
                {"name": "@lead_name", "required": False, "type": "string"},
            ],
            "example": "closebot live-message send --id <contactId> --message 'Hello'",
        },
    }

    for tag, cmds in sorted(by_tag.items()):
        cli["commands"][slug(tag)] = cmds

    write_yaml(CLI_DIR / "closebot-cli.spec.yaml", cli)
    write_json(CLI_DIR / "closebot-cli.spec.json", cli)


# ---------- 5. docs/endpoints/<tag>.md ----------
def render_endpoint_md(spec: dict[str, Any], path: str, method: str, op: dict[str, Any]) -> str:
    args = collect_args(spec, op)
    path_args = [a for a in args if a.get("in") == "path"]
    query_args = [a for a in args if a.get("in") == "query"]
    header_args = [a for a in args if a.get("in") == "header"]
    body_schema = request_body_schema(op)
    resp_schema = primary_response_schema(op)
    summary = operation_summary(op).strip() or "(no summary)"
    op_id = op.get("operationId") or ""
    desc = (op.get("description") or "").strip()

    lines: list[str] = []
    lines.append(f"### `{method.upper()} {path}`")
    lines.append("")
    lines.append(f"**Tag:** {primary_tag(op)} · **OperationId:** `{op_id}` · **Auth:** `X-CB-KEY`")
    lines.append("")
    lines.append(f"**Summary:** {summary}")
    if desc and desc != summary:
        lines.append("")
        lines.append(desc)
    lines.append("")

    if path_args:
        lines.append("**Path params:**")
        for a in path_args:
            req = "required" if a["required"] else "optional"
            doc = f" — {a['doc']}" if a.get("doc") else ""
            lines.append(f"- `{a['name']}` ({a['type']}, {req}){doc}")
        lines.append("")

    if query_args:
        lines.append("**Query params:**")
        for a in query_args:
            req = "required" if a["required"] else "optional"
            doc = f" — {a['doc']}" if a.get("doc") else ""
            lines.append(f"- `{a['name']}` ({a['type']}, {req}){doc}")
        lines.append("")

    if header_args:
        lines.append("**Header params:**")
        for a in header_args:
            req = "required" if a["required"] else "optional"
            doc = f" — {a['doc']}" if a.get("doc") else ""
            lines.append(f"- `{a['name']}` ({a['type']}, {req}){doc}")
        lines.append("")

    if body_schema:
        lines.append(f"**Request body:** [`{body_schema}`](../../schema/openapi.json) (`application/json`)")
        lines.append("")

    responses = op.get("responses") or {}
    if responses:
        lines.append("**Responses:**")
        for code in sorted(responses.keys()):
            r = responses[code]
            d = (r.get("description") or "").strip().splitlines()[0]
            content = r.get("content") or {}
            schema_ref = None
            for ct in ("application/json", "text/json"):
                sch = content.get(ct, {}).get("schema") or {}
                schema_ref = sch.get("$ref") or (sch.get("items") or {}).get("$ref")
                if schema_ref:
                    break
            sname = schema_name_from_ref(schema_ref)
            lines.append(f"- `{code}` — {d}" + (f" → `{sname}`" if sname else ""))
        lines.append("")

    # curl example
    headers = ['-H "X-CB-KEY: $CLOSEBOT_API_KEY"']
    if method.lower() in {"post", "put", "patch"}:
        headers.append('-H "Content-Type: application/json"')
    body = ""
    if body_schema:
        body = " \\\n  -d '{...see schema...}'"
    full_path = path
    for a in path_args:
        full_path = full_path.replace("{" + a["name"] + "}", f"<{a['name']}>")
    lines.append("**Example:**")
    lines.append("```bash")
    if method.lower() == "get":
        lines.append(f'curl "{REST_BASE}{full_path}" \\')
    else:
        lines.append(f'curl -X {method.upper()} "{REST_BASE}{full_path}" \\')
    for h in headers[:-1]:
        lines.append(f"  {h} \\")
    lines.append(f"  {headers[-1]}{body}")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def emit_endpoint_docs(spec: dict[str, Any]) -> None:
    by_tag: dict[str, list[tuple[str, str, dict[str, Any]]]] = {}
    for path, method, op in iter_operations(spec):
        by_tag.setdefault(primary_tag(op), []).append((path, method, op))

    for tag, ops in sorted(by_tag.items()):
        ops.sort(key=lambda x: (x[0], x[1]))
        body = [
            f"# {tag} — endpoint reference",
            "",
            f"Base URL: `{REST_BASE}`  ·  Auth header: `X-CB-KEY`  ·  {len(ops)} endpoint(s)",
            "",
            "Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)",
            "",
            "---",
            "",
        ]
        moved = MOVED_OPS.get(tag)
        if moved:
            body.append("**Removed upstream:**")
            for old, new, doc in moved:
                body.append(f"- `{old}` — gone from the live spec; use [`{new}`]({doc}) (see also `/leaderboard/metrics`, `/leaderboard/profile`)")
            body += ["", "---", ""]
        for p, m, o in ops:
            body.append(render_endpoint_md(spec, p, m, o))
            body.append("---")
            body.append("")
        write_text(DOCS_DIR / f"{slug(tag)}.md", "\n".join(body))


def main() -> int:
    spec = load_spec()
    emit_openapi_yaml(spec)
    emit_endpoints_index(spec)
    emit_live_message_spec()
    emit_cli_spec(spec)
    emit_endpoint_docs(spec)
    print(f"OK · paths={len(spec.get('paths', {}))} · schemas={len((spec.get('components', {}).get('schemas') or {}))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
