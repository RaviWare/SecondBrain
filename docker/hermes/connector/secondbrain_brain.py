#!/usr/bin/env python3
"""SecondBrain brain connector for the Hermes agent.

Exposes the user's SecondBrain vault to the agent as three tools — query, search,
and ingest — by calling the token-authed /api/agent/* endpoints. Config (apiBase +
token) is read from ~/.secondbrain/config.json, written by entrypoint.sh.

Every call touches the idle-watchdog heartbeat so the container stays warm while
the agent is actually working.

Usage (also callable by Hermes as a shell tool):
    python secondbrain_brain.py query "what did we decide about pricing?"
    python secondbrain_brain.py search "onboarding" --limit 5
    python secondbrain_brain.py ingest --type text --title "Note" --text "..."
"""
import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

CONFIG_PATH = pathlib.Path.home() / ".secondbrain" / "config.json"
HEARTBEAT = pathlib.Path.home() / ".secondbrain" / "heartbeat"


def _config():
    try:
        return json.loads(CONFIG_PATH.read_text())
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"[secondbrain] missing/invalid config: {exc}")


def _beat():
    try:
        HEARTBEAT.parent.mkdir(parents=True, exist_ok=True)
        HEARTBEAT.touch()
    except Exception:  # noqa: BLE001
        pass


def _request(method, path, body=None, params=None):
    cfg = _config()
    url = cfg["apiBase"].rstrip("/") + path
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {cfg['token']}")
    req.add_header("Content-Type", "application/json")
    _beat()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        return {"error": f"HTTP {exc.code}", "detail": exc.read().decode(errors="replace")}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def cmd_query(args):
    return _request("POST", "/api/agent/query", body={"question": args.question})


def cmd_search(args):
    return _request("GET", "/api/agent/search", params={"q": args.query, "limit": args.limit})


def cmd_ingest(args):
    body = {"type": args.type, "title": args.title}
    if args.type == "url":
        body["url"] = args.url
    else:
        body["text"] = args.text
    return _request("POST", "/api/agent/ingest", body=body)


def main():
    p = argparse.ArgumentParser(description="SecondBrain brain connector")
    sub = p.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("query", help="Synthesis answer + gap analysis")
    q.add_argument("question")
    q.set_defaults(fn=cmd_query)

    s = sub.add_parser("search", help="Raw retrieval (no LLM cost)")
    s.add_argument("query")
    s.add_argument("--limit", type=int, default=8)
    s.set_defaults(fn=cmd_search)

    i = sub.add_parser("ingest", help="Add a source to the vault")
    i.add_argument("--type", choices=["url", "text"], required=True)
    i.add_argument("--title", default="Agent capture")
    i.add_argument("--url", default=None)
    i.add_argument("--text", default=None)
    i.set_defaults(fn=cmd_ingest)

    args = p.parse_args()
    print(json.dumps(args.fn(args), indent=2))


if __name__ == "__main__":
    main()
