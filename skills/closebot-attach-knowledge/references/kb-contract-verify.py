#!/usr/bin/env python3
"""
kb-contract-verify.py — independent evaluator probe for CloseBot KB contracts.

Purpose: give an *evaluator* an out-of-band verification channel that does
NOT reuse the tool-under-test's code. Point it at the manifest the tool wrote
and it asserts remote state matches, per AC, printing evidence lines.

Requires CLOSEBOT_API_KEY: export it, or put it in <repo>/.env (read automatically).

Usage:
  python3 kb-contract-verify.py <clientName> [--manifest PATH]
  python3 kb-contract-verify.py --all       [--manifest PATH]

Checks (prints PASS/FAIL + evidence per line):
  - source exists remotely and .name == client name
  - every manifest file fileId is attached to the source (and vice versa: no orphans)
  - every manifest file's remote /view sha256 == manifest sha256 (byte fidelity)
  - Smart FAQ count on source >= manifest faq count, and each manifest Q&A present
Exits non-zero if any check fails. Read-only: only GET calls.
"""
import argparse, hashlib, json, os, sys, urllib.parse, urllib.request

BASE = "https://api.closebot.com"
CLOSEBOT_DIR = os.environ.get('CLOSEBOT_DIR', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))
DEFAULT_MANIFEST = os.path.join(CLOSEBOT_DIR, ".closebot-manifest.json")


def get(path, key, raw=False):
    req = urllib.request.Request(BASE + path, headers={"X-CB-KEY": key})
    with urllib.request.urlopen(req, timeout=60) as r:
        b = r.read()
        return b if raw else (json.loads(b.decode()) if b else None)


def list_library(key):
    d = get("/library/files", key)
    return d if isinstance(d, list) else (d.get("results") or d.get("files") or [])


def attached_ids(key, source_id):
    out = {}
    for f in list_library(key):
        srcs = [(s.get("id") if isinstance(s, dict) else s)
                for s in (f.get("sources") or [])]
        if str(source_id) in [str(x) for x in srcs]:
            fid = f.get("fileId") or f.get("id")
            out[str(fid)] = f.get("fileName") or f.get("name")
    return out  # fileId -> fileName


def faqs(key, source_id):
    q = urllib.parse.urlencode({"sourceId": source_id})
    d = get(f"/smart-faq?{q}", key)
    items = d if isinstance(d, list) else (d.get("results") or [])
    return [(f.get("question", "").strip(), f.get("answer", "").strip())
            for f in items]


def check_client(name, entry, key):
    ok = True
    sid = entry.get("sourceId")
    if not sid:
        print(f"FAIL [{name}] manifest has no sourceId"); return False

    # source name
    src = get(f"/agency/source/{sid}", key)
    rname = src.get("name") if isinstance(src, dict) else None
    good = rname == name
    ok &= good
    print(f"{'PASS' if good else 'FAIL'} [{name}] source name == client "
          f"(remote={rname!r}, sourceId={sid})")

    # attachments both directions
    att = attached_ids(key, sid)
    man = {str(v["fileId"]): v for v in entry.get("files", {}).values()}
    man_ids, att_ids = set(man), set(att)
    missing = man_ids - att_ids      # in manifest, not attached
    orphans = att_ids - man_ids      # attached, not in manifest
    good = not missing and not orphans
    ok &= good
    print(f"{'PASS' if good else 'FAIL'} [{name}] attachments match manifest "
          f"(manifest={len(man_ids)} attached={len(att_ids)} "
          f"missing={sorted(missing)} orphans={sorted(orphans)})")

    # byte fidelity on every manifest file
    for fid, meta in man.items():
        try:
            body = get(f"/library/files/{fid}/view", key, raw=True)
        except urllib.error.HTTPError as e:
            print(f"FAIL [{name}] view {fid} -> HTTP {e.code} "
                  f"(webscrape files 404 on /view; skip those)")
            ok = False
            continue
        h = hashlib.sha256(body).hexdigest()
        good = h == meta.get("sha256")
        ok &= good
        print(f"{'PASS' if good else 'FAIL'} [{name}] bytes {meta.get('fileName')} "
              f"({fid}) remote==manifest sha {h[:12]}")

    # FAQs
    man_faq = {(f.get("question", "").strip(), f.get("answer", "").strip())
               for f in entry.get("faqs", [])}
    rem_faq = set(faqs(key, sid))
    missing_faq = man_faq - rem_faq
    good = not missing_faq
    ok &= good
    print(f"{'PASS' if good else 'FAIL'} [{name}] FAQs present "
          f"(manifest={len(man_faq)} remote={len(rem_faq)} missing={len(missing_faq)})")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("client", nargs="?", help="exact client name in manifest")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--manifest", default=DEFAULT_MANIFEST)
    a = ap.parse_args()
    key = os.environ.get("CLOSEBOT_API_KEY", "").strip()
    env_path = os.path.join(CLOSEBOT_DIR, ".env")
    if not key and os.path.exists(env_path):
        for line in open(env_path):
            if line.strip().startswith("CLOSEBOT_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit("CLOSEBOT_API_KEY not set (export it, or cp .env.example .env && chmod 600 .env)")
    m = json.load(open(a.manifest)).get("clients", {})
    targets = list(m) if a.all else ([a.client] if a.client else [])
    if not targets:
        sys.exit("pass a client name or --all")
    allok = True
    for t in targets:
        e = m.get(t)
        if not e:
            print(f"FAIL [{t}] not in manifest"); allok = False; continue
        allok &= check_client(t, e, key)
    sys.exit(0 if allok else 1)


if __name__ == "__main__":
    main()
