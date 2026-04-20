# ADR 0003 — MCP as a first-class interface

**Date:** 2026-04-19
**Status:** Accepted

## Context

Most SaaS products treat their API as an afterthought — a side-door for integrations, never the primary interface. The UI is the product.

Rokki targets professionals who already use AI assistants (Claude, ChatGPT) as their daily driver. For those users, the AI is often a better interface than a UI: natural language beats navigation.

## Decision

Rokki is designed with **two equal interfaces**:
1. The web UI (for humans who want visual, direct manipulation)
2. The MCP server (for AI clients, acting on behalf of authenticated users)

Both hit the same API. Both are first-class citizens. Neither is an afterthought.

Specifically:
- Every user action available in the UI must be available via MCP tool
- Every MCP tool must work with user-scoped tokens (never service-key bypasses)
- The MCP server supports sampling so tools can work without forcing BYOK setup
- Custom user-built tools are exposed via MCP automatically (not just the built-in set)
- Rate limits, approvals, and audit logs apply equally to UI and MCP calls
- OpenAPI spec is generated so non-MCP LLM clients (ChatGPT custom GPTs, Gemini) also work

## Consequences

**Positives:**
- Any LLM-compatible client becomes a Rokki interface. Vendor-agnostic by design.
- Users' existing AI habits extend to Rokki without extra learning
- The API-first discipline improves the UI (forces clear contracts, better error messages)
- Third parties can build integrations without special permission (they just get a token)
- If the UI language of 2030 is different (voice? ambient?), the backend doesn't care

**Negatives / risks:**
- Building two interfaces is more work than one
  - Mitigation: most code is in the API layer; MCP server is a thin protocol translator
- Keeping UI and MCP feature parity adds coordination overhead
  - Mitigation: acceptance tests include both; a feature isn't "done" unless both work
- Security surface is larger (MCP tokens as an additional credential class)
  - Mitigation: tokens are scoped, rate-limited, revocable, audit-logged

## Alternatives considered

- **UI-only, MCP added later:** would have been faster for Phase 1, but MCP retrofit is typically painful (UI assumptions bake into the data model). Building in parallel forces clean contracts.
- **MCP-only, no UI:** not viable — most collaborators (architects, bank officers) won't install an AI client. UI is necessary.
- **Proprietary Rokki protocol instead of MCP:** rejected — betting on an open standard means we're not the bottleneck for client support.

## Revisit

Revisit if:
- MCP is supplanted by a different standard protocol (e.g., something from OpenAI or W3C)
  - At that point, add a second adapter; keep the internal API stable
- MCP usage stays below 5% of active sessions for 6+ months
  - Unlikely given positioning, but would prompt a rethink of the 50/50 parity rule
- Security incidents trace to MCP token misuse at a rate higher than cookie auth
  - Mitigation would be additional per-tool approval gating, not abandonment of MCP

## Revision history

- 2026-04-19: Initial decision (this doc)
