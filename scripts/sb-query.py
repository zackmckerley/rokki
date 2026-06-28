#!/usr/bin/env python3
"""Run a SQL query against a Supabase project via the Management API.

Reads the access token from SUPABASE_ACCESS_TOKEN (never hard-coded here).
Usage:  SUPABASE_ACCESS_TOKEN=... python scripts/sb-query.py <project_ref> "<sql>"
        (or pipe the SQL on stdin)

Prints the JSON result rows to stdout. Used by the prod->sandbox mirror.
"""
import os
import sys
import json
import urllib.request
import urllib.error

token = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not token:
    print("SUPABASE_ACCESS_TOKEN not set", file=sys.stderr)
    sys.exit(2)

ref = sys.argv[1]
query = sys.argv[2] if len(sys.argv) > 2 else sys.stdin.read()

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/database/query",
    data=json.dumps({"query": query}).encode(),
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        # Cloudflare WAF (error 1010) blocks the default python-urllib UA.
        "User-Agent": "curl/8.5.0",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        sys.stdout.write(r.read().decode())
except urllib.error.HTTPError as e:
    sys.stderr.write(f"HTTP {e.code}: {e.read().decode()}\n")
    sys.exit(1)
