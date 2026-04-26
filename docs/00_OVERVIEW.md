# Rokki — Documentation Overview

This directory is the detailed implementation specification. `BUILD_SPEC.md` in the project root is the high-level vision; these docs are the concrete, copy-pasteable, mistake-proof specs.

## Reading order

Read the BUILD_SPEC.md first, then these docs in order:

1. **[00_OVERVIEW.md](00_OVERVIEW.md)** — this file
2. **[01_DATA_MODEL.md](01_DATA_MODEL.md)** — Postgres schema, RLS policies, triggers, indexes
3. **[02_API.md](02_API.md)** — REST API endpoints, request/response shapes, error codes
4. **[03_MCP.md](03_MCP.md)** — MCP server protocol, tool definitions, sampling flow
5. **[04_AUTH_SECURITY.md](04_AUTH_SECURITY.md)** — auth flows, token format, encryption, CSP, CORS, threat model
6. **[05_FILES.md](05_FILES.md)** — upload/download flows, signed URLs, virus scan, versioning, RAG indexing
7. **[06_TOOLS.md](06_TOOLS.md)** — tool manifest, execution sandbox, approval flow, quotas, BYOK, sampling
8. **[07_REALTIME.md](07_REALTIME.md)** — pubsub topology, presence, ticker tape, activity feed
9. **[08_UI_DESIGN.md](08_UI_DESIGN.md)** — design tokens, component specs, keyboard shortcuts, breakpoints
10. **[09_ENVIRONMENTS.md](09_ENVIRONMENTS.md)** — local dev, staging, prod, env vars, CI/CD
11. **[10_TESTING.md](10_TESTING.md)** — test strategy, fixtures, e2e with examples
12. **[11_ACCEPTANCE.md](11_ACCEPTANCE.md)** — Phase 0/1/2 concrete acceptance tests
13. **[12_MCP_PARITY.md](12_MCP_PARITY.md)** — UI ↔ REST ↔ MCP coverage audit + gap priority list

## Document responsibility map

When you have a question, which doc has the answer?

| Question | Doc |
|---|---|
| "What columns does this table have?" | 01_DATA_MODEL |
| "Can user X see Y?" | 01_DATA_MODEL (RLS) + 04_AUTH_SECURITY |
| "What endpoint do I call to create X?" | 02_API |
| "What does my AI see when it connects?" | 03_MCP |
| "How does login work?" | 04_AUTH_SECURITY |
| "How are BYOK keys encrypted?" | 04_AUTH_SECURITY |
| "How do I upload a 500MB drawing?" | 05_FILES |
| "How does Claude read a file?" | 05_FILES (RAG) + 03_MCP (tool) |
| "How do I publish a tool?" | 06_TOOLS |
| "What happens when a tool needs approval?" | 06_TOOLS |
| "How does the ticker tape work?" | 07_REALTIME |
| "What font sizes do I use?" | 08_UI_DESIGN |
| "What keyboard shortcut does X?" | 08_UI_DESIGN |
| "How do I run this locally?" | 09_ENVIRONMENTS |
| "How do I know when Phase 1 is done?" | 11_ACCEPTANCE |

## Cross-reference convention

When one doc references another, use `§<number>.<section>` — e.g. `§01.4` means "see doc 01, section 4". Inline links use relative paths: `[§04.2 auth tokens](04_AUTH_SECURITY.md#42-access-tokens)`.

## Editing rules

- If reality diverges from a doc during implementation, **update the doc first**, then code to the updated doc.
- Never silently drift. A stale doc is worse than no doc.
- All ADRs live in `docs/adr/`. New architectural decisions get a new ADR. Old ADRs are not edited; if a decision is reversed, a new ADR supersedes it and says so.

## Source of truth priority

When docs conflict:
1. The Postgres schema (01_DATA_MODEL) is the ultimate source of truth for data
2. The OpenAPI spec (generated from 02_API) is the source for HTTP contracts
3. The MCP tool registry (03_MCP) is the source for AI-visible surface area
4. When a higher-level doc (BUILD_SPEC, README) contradicts a detailed doc, the detailed doc wins

## What each doc must contain

Every doc in this directory:
- States its scope in the first paragraph
- Has copy-pasteable, runnable artifacts (SQL, TypeScript, JSON schemas, YAML configs) — not prose descriptions where a code block would do
- Enumerates edge cases explicitly ("what happens when…")
- Cross-references related docs at relevant points
- Ends with a "common pitfalls" section listing the mistakes a careless implementer might make

If a doc doesn't meet these criteria, fix the doc before shipping code that depends on it.
