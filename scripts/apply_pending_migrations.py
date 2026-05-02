#!/usr/bin/env python3
"""
Apply pending Supabase migrations to a remote project via the
Management API.

Reads migrations from supabase/migrations/*.sql, queries the production
schema_migrations table for what's already applied, runs each pending
SQL file in chronological order, and inserts a row into
schema_migrations on success so subsequent runs are idempotent.

Stops on first failure so we don't leave the schema half-mutated.

env:
  SUPA_TOKEN  Supabase access token (sbp_...)
  PROJECT_REF e.g. bwtmtpcgilvrkhougjdo
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib import request, error


def post_query(token: str, project_ref: str, sql: str) -> tuple[int, object]:
    body = json.dumps({"query": sql}).encode("utf-8")
    req = request.Request(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            # Cloudflare on api.supabase.com 403s requests with the
            # default urllib UA; mimic curl/script so the request
            # isn't filtered as a bot.
            "User-Agent": "rokki-migrate/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(raw or "null")
            except json.JSONDecodeError:
                return resp.status, raw
    except error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw or "null")
        except json.JSONDecodeError:
            return e.code, raw


def list_applied(token: str, ref: str) -> set[str]:
    status, data = post_query(
        token,
        ref,
        "SELECT version FROM supabase_migrations.schema_migrations;",
    )
    if status >= 400 or not isinstance(data, list):
        raise SystemExit(f"failed to list applied migrations: {status} {data}")
    return {str(row.get("version")) for row in data}


def split_statements(sql: str) -> list[str]:
    """
    Split a Postgres script into statements at top-level semicolons,
    correctly skipping over single-quoted strings and dollar-quoted
    bodies (used by CREATE FUNCTION blocks).

    Returns the original statement texts (sans the trailing `;`).
    """
    stmts: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)
    in_single = False
    dollar_tag: str | None = None
    while i < n:
        ch = sql[i]
        if dollar_tag is not None:
            buf.append(ch)
            if ch == "$":
                # Look for matching closing tag.
                end = sql.find(dollar_tag, i)
                if end == i:
                    buf.append(sql[i + 1 : i + len(dollar_tag)])
                    i += len(dollar_tag)
                    dollar_tag = None
                    continue
            i += 1
            continue
        if in_single:
            buf.append(ch)
            if ch == "'" and (i + 1 >= n or sql[i + 1] != "'"):
                in_single = False
            elif ch == "'" and sql[i + 1] == "'":
                buf.append(sql[i + 1])
                i += 1
            i += 1
            continue
        # Not in any quote.
        if ch == "'":
            in_single = True
            buf.append(ch)
            i += 1
            continue
        if ch == "$":
            m = re.match(r"\$[A-Za-z0-9_]*\$", sql[i:])
            if m:
                tag = m.group(0)
                buf.append(tag)
                dollar_tag = tag
                i += len(tag)
                continue
        if ch == "-" and i + 1 < n and sql[i + 1] == "-":
            # Line comment — skip to newline.
            nl = sql.find("\n", i)
            if nl == -1:
                break
            buf.append(sql[i:nl])
            i = nl
            continue
        if ch == "/" and i + 1 < n and sql[i + 1] == "*":
            # Block comment — skip to */.
            end = sql.find("*/", i + 2)
            if end == -1:
                break
            buf.append(sql[i : end + 2])
            i = end + 2
            continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                stmts.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        stmts.append(tail)
    return stmts


def record_applied(
    token: str,
    ref: str,
    version: str,
    name: str,
    statements: list[str],
) -> None:
    # Use parameterised insert via psql-equivalent quote_literal — we
    # ship the statements as an array. Since the Management API only
    # accepts raw SQL, we have to escape ' inside each statement.
    escaped = [s.replace("'", "''") for s in statements]
    arr_lit = "ARRAY[" + ",".join("'" + s + "'" for s in escaped) + "]::TEXT[]"
    safe_name = name.replace("'", "''")
    sql = (
        "INSERT INTO supabase_migrations.schema_migrations "
        "(version, name, statements) VALUES ("
        f"'{version}', '{safe_name}', {arr_lit}"
        ") ON CONFLICT (version) DO NOTHING;"
    )
    status, data = post_query(token, ref, sql)
    if status >= 400:
        raise SystemExit(f"failed to record {version}: {status} {data}")


def main() -> int:
    token = os.environ.get("SUPA_TOKEN")
    ref = os.environ.get("PROJECT_REF")
    if not token or not ref:
        print("set SUPA_TOKEN + PROJECT_REF", file=sys.stderr)
        return 2
    repo = Path(__file__).resolve().parent.parent
    migrations_dir = repo / "supabase" / "migrations"
    files = sorted(migrations_dir.glob("*.sql"))
    applied = list_applied(token, ref)
    print(f"{len(applied)} migrations already applied")
    print(f"{len(files)} migrations in repo")
    pending = []
    for f in files:
        m = re.match(r"^(\d{14})_(.+)\.sql$", f.name)
        if not m:
            continue
        version, name = m.group(1), m.group(2)
        if version not in applied:
            pending.append((version, name, f))
    print(f"{len(pending)} pending:")
    for v, n, _ in pending:
        print(f"  {v} {n}")
    if not pending:
        print("nothing to do")
        return 0
    print()
    for version, name, path in pending:
        print(f"--- applying {version} {name} ---", flush=True)
        sql = path.read_text(encoding="utf-8")
        status, data = post_query(token, ref, sql)
        if status >= 400:
            print(f"  FAILED ({status}): {data}", flush=True)
            return 1
        statements = split_statements(sql)
        record_applied(token, ref, version, name, statements)
        print(f"  OK ({len(statements)} statements)", flush=True)
    print("\nall pending migrations applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
