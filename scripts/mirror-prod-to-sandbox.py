#!/usr/bin/env python3
"""One-time snapshot mirror of production Supabase data into sandbox.

Reads PRODUCTION (strictly SELECT-only) and writes ONLY to SANDBOX. Uses
the Supabase Management API `database/query` endpoint, so it needs only a
personal access token (SUPABASE_ACCESS_TOKEN) — no DB passwords.

  Dry run (default):  SUPABASE_ACCESS_TOKEN=... python scripts/mirror-prod-to-sandbox.py
  Execute:            SUPABASE_ACCESS_TOKEN=... python scripts/mirror-prod-to-sandbox.py --execute

Loads happen with session_replication_role='replica' so FK/trigger checks
are skipped (order-independent). Encrypted/secret + transient tables are
NOT copied. Production is never modified.
"""
import os
import sys
import json
import urllib.request
import urllib.error

TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not TOKEN:
    raise SystemExit("SUPABASE_ACCESS_TOKEN not set")

PROD = "bwtmtpcgilvrkhougjdo"      # rokki-production  (READ ONLY)
SANDBOX = "hqsdhwlokfwcitfitees"   # rokki-staging     (write target)
assert PROD != SANDBOX, "refusing to run with prod==sandbox"

EXECUTE = "--execute" in sys.argv
TAG = "$MIRRORDATA$"  # dollar-quote tag; assumed absent from the data

# User-facing tables to mirror. Order is irrelevant (replica mode). Each
# is DELETE'd then re-filled from prod, so sandbox matches prod exactly.
COPY = [
    "public.profiles",
    "public.spaces",
    "public.space_members",
    "public.terminals",
    "public.terminal_members",
    "public.folders",
    "public.tasks",
    "public.task_assignees",
    "public.subtasks",
    "public.task_watchers",
    "public.calendar_connections",
    "public.calendar_events",
    "public.message_threads",
    "public.messages",
    "public.activity",
]
# Deliberately NOT copied: domain_events, rate_limit_hits,
# session_revocations, impersonation_events (transient / audit logs);
# access_tokens, push_subscriptions (per-env secrets; empty anyway);
# platform_config, modules_catalog, feature_flags (env config — leave
# sandbox's own).


def api(ref, sql):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "curl/8.5.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:400]}")


def read_prod(sql):
    s = sql.lstrip().lower()
    assert s.startswith("select"), "prod is read-only"
    return api(PROD, sql)


def write_sandbox(sql):
    # Hard guard: writes can only ever target SANDBOX.
    return api(SANDBOX, sql)


def count(ref, tbl):
    return api(ref, f"SELECT count(*)::int AS c FROM {tbl}")[0]["c"]


def table_columns(tbl):
    """(insertable cols, generated cols). Generated (e.g. search_vector
    tsvector) can't take an explicit value — Postgres recomputes them."""
    schema, name = tbl.split(".")
    rows = read_prod(
        "SELECT column_name, is_generated FROM information_schema.columns "
        f"WHERE table_schema='{schema}' AND table_name='{name}' "
        "ORDER BY ordinal_position"
    )
    insertable = [r["column_name"] for r in rows if r["is_generated"] != "ALWAYS"]
    generated = [r["column_name"] for r in rows if r["is_generated"] == "ALWAYS"]
    return insertable, generated


def fetch_json(ref, sql):
    return read_prod(sql)[0]["d"] if ref == PROD else api(ref, sql)[0]["d"]


print(f"Mirror  prod({PROD})  ->  sandbox({SANDBOX})   EXECUTE={EXECUTE}\n")

# ---- 1) make sure every prod user exists in sandbox (add missing) -------
prod_users = read_prod(
    "SELECT coalesce(json_agg(u), '[]'::json) AS d FROM auth.users u"
)[0]["d"]
sandbox_ids = {r["id"] for r in api(SANDBOX, "SELECT id FROM auth.users")}
missing = [u for u in prod_users if u["id"] not in sandbox_ids]
print(
    f"auth.users  prod={len(prod_users)}  sandbox={len(sandbox_ids)}  "
    f"missing={[u['email'] for u in missing]}"
)
if missing and EXECUTE:
    # Minimal insert — just enough for FK integrity. The display name
    # comes from the copied public.profiles row; the user won't log in
    # to sandbox, so password/identity columns aren't needed.
    vals = ",".join(
        "('00000000-0000-0000-0000-000000000000'::uuid, "
        f"'{u['id']}'::uuid, 'authenticated', 'authenticated', "
        f"'{u['email']}', now(), now())"
        for u in missing
    )
    try:
        write_sandbox(
            "SET session_replication_role='replica'; "
            "INSERT INTO auth.users "
            "(instance_id, id, aud, role, email, created_at, updated_at) "
            f"VALUES {vals} ON CONFLICT (id) DO NOTHING; "
            "SET session_replication_role='origin';"
        )
        print("  + added missing user(s)")
    except Exception as e:  # noqa: BLE001
        print(f"  ! could not add missing user(s) (continuing): {e}")

# ---- 2) copy each table -------------------------------------------------
print()
failures = []
for tbl in COPY:
    try:
        insertable, generated = table_columns(tbl)
        rows = read_prod(
            f"SELECT coalesce(json_agg(t), '[]'::json) AS d FROM {tbl} t"
        )[0]["d"]
        # Drop generated columns from the payload so json_populate_recordset
        # never tries to set them.
        for r in rows:
            for g in generated:
                r.pop(g, None)
        before = count(SANDBOX, tbl)
        line = f"{tbl:<28} prod={len(rows):<4} sandbox_before={before:<4}"
        if not EXECUTE:
            print(line + "  (dry-run)")
            continue
        j = json.dumps(rows)
        assert TAG not in j, f"{TAG} present in {tbl} data"
        cols = ", ".join(f'"{c}"' for c in insertable)
        write_sandbox(
            "SET session_replication_role='replica'; "
            f"DELETE FROM {tbl}; "
            f"INSERT INTO {tbl} ({cols}) "
            f"SELECT {cols} FROM json_populate_recordset(null::{tbl}, {TAG}{j}{TAG}::json); "
            "SET session_replication_role='origin';"
        )
        after = count(SANDBOX, tbl)
        ok = "OK" if after == len(rows) else "MISMATCH!"
        print(line + f" -> sandbox_after={after:<4} {ok}")
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:200]
        print(f"{tbl:<28} FAILED: HTTP {e.code} {msg}")
        failures.append((tbl, msg))
    except Exception as e:  # noqa: BLE001
        print(f"{tbl:<28} FAILED: {e}")
        failures.append((tbl, str(e)))

print()
if failures:
    print(f"{len(failures)} table(s) failed:")
    for t, m in failures:
        print(f"  - {t}: {m}")
    sys.exit(1)
print("done" + ("" if EXECUTE else "  (dry run — no writes performed)"))
