#!/usr/bin/env python3
"""
Wrap exported HTTP handlers in `withObservability`.

Used for the bulk admin-routes sweep. Transforms each input file:

  Before:
    export async function GET(request: NextRequest) { ... }
    export async function POST(request: NextRequest, { params }: Props) { ... }

  After:
    async function handleGet(request: NextRequest) { ... }
    async function handlePost(request: NextRequest, { params }: Props) { ... }
    ...
    export const GET  = withObservability(handleGet,  "GET  /api/v1/...");
    export const POST = withObservability<Props>(handlePost, "POST /api/v1/...");

Also inserts `import { withObservability } from "@/lib/observability"`
under the first existing import if not already present.

Route label is derived from the file path: dynamic segments like
`[id]` become `:id` per our existing convention.

Skips files that already use `withObservability` (idempotent). Writes
back in-place. Run from repo root.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APP_DIR = REPO_ROOT / "apps" / "web" / "src"
ROUTES_DIR = APP_DIR / "app" / "api"

METHOD_RE = re.compile(
    r"^export async function (GET|POST|PATCH|DELETE|PUT)\s*\(",
    re.MULTILINE,
)
IMPORT_RE = re.compile(r'^import .+?;\s*$', re.MULTILINE)


def route_label(path: Path) -> str:
    """Convert a route.ts path to its API label.

    apps/web/src/app/api/v1/admin/foo/[bar]/route.ts
      → /api/v1/admin/foo/:bar
    """
    rel = path.relative_to(APP_DIR / "app").as_posix()
    # Drop trailing /route.ts and the leading 'api/...' is already
    # the path. Convert [id] → :id.
    rel = rel[: -len("/route.ts")]
    rel = re.sub(r"\[([^\]]+)\]", r":\1", rel)
    return f"/{rel}"


def uses_props(text: str) -> bool:
    """Heuristic: this route has dynamic params (`{ params }`) so
    its handler signature accepts a context object. We surface that
    by typing `withObservability<Props>`."""
    return "interface Props" in text or "type Props" in text


def transform(path: Path) -> bool:
    """Mutate the file in-place. Returns True on change."""
    text = path.read_text(encoding="utf-8")
    if "withObservability" in text:
        return False  # already done

    methods = METHOD_RE.findall(text)
    if not methods:
        return False  # nothing to wrap

    # 1. Rename `export async function GET(...)` to `async function handleGet(...)`.
    for m in methods:
        title = m.title()  # GET → Get
        text = text.replace(
            f"export async function {m}(",
            f"async function handle{title}(",
        )

    # 2. Add the import. Insert after the *last* line at the top that
    #    starts with `import ` (so we don't split related import
    #    groups).
    import_matches = list(IMPORT_RE.finditer(text))
    if import_matches:
        last_import = import_matches[-1]
        insert_at = last_import.end()
        new_import = '\nimport { withObservability } from "@/lib/observability";'
        text = text[:insert_at] + new_import + text[insert_at:]
    else:
        # No imports at all — odd, but prepend.
        text = (
            'import { withObservability } from "@/lib/observability";\n\n'
            + text
        )

    # 3. Append `export const X = withObservability(...)` at the end.
    label = route_label(path)
    props_generic = "<Props>" if uses_props(text) else ""
    appended = ["", ""]
    for m in methods:
        title = m.title()  # GET → Get
        appended.append(
            f"export const {m} = withObservability{props_generic}("
        )
        appended.append(f"  handle{title},")
        appended.append(f'  "{m} {label}",')
        appended.append(");")
    text = text.rstrip() + "\n".join(appended) + "\n"

    path.write_text(text, encoding="utf-8", newline="\n")
    return True


def main(argv: list[str]) -> int:
    targets = []
    if len(argv) > 1:
        for arg in argv[1:]:
            p = Path(arg).resolve()
            if p.is_file():
                targets.append(p)
            elif p.is_dir():
                targets.extend(p.rglob("route.ts"))
    else:
        # Default: every route.ts under /api/v1/admin (the sweep target).
        targets = list((ROUTES_DIR / "v1" / "admin").rglob("route.ts"))

    changed = 0
    skipped_done = 0
    skipped_empty = 0
    for path in sorted(targets):
        text = path.read_text(encoding="utf-8")
        if "withObservability" in text:
            skipped_done += 1
            continue
        if not METHOD_RE.search(text):
            skipped_empty += 1
            continue
        if transform(path):
            changed += 1
            print(f"  wrapped: {path.relative_to(REPO_ROOT)}")

    print()
    print(f"changed:        {changed}")
    print(f"already wrapped: {skipped_done}")
    print(f"no handlers:     {skipped_empty}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
