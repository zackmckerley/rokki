# ADR 0001 — Stack choices

**Date:** 2026-04-19
**Status:** Accepted

## Context

We need to pick a technology stack for Rokki that balances:
- Zero-to-working speed (internal tool, small team)
- $1M/mo quality bar (polished UI, tight UX)
- 50-year durability (avoid lock-in, standards over products)
- Solo-developer operability (not a platform team)

## Decision

- **Next.js 15 (App Router) + React 19 + TypeScript strict** for web
- **Supabase** for Postgres + auth + RLS + realtime + storage metadata
- **Azure Blob Storage** for actual file bytes
- **Cloudflare** for DNS, CDN, WAF
- **Vercel** for Next.js hosting
- **Azure Container Apps** for MCP server + tool executor
- **Tailwind CSS + shadcn/ui + Radix** for UI primitives
- **Resend** for transactional email
- **Upstash Redis** for rate limiting
- **Sentry + Axiom + PostHog** for observability

## Consequences

**Positives:**
- Supabase handles auth + RLS + realtime in one service — huge time savings vs. rolling our own
- Next.js App Router is current industry standard; React Server Components let us keep UI thin and move logic server-side
- Cloudflare free tier covers DNS + CDN + basic WAF without cost
- Azure Blob + Vercel + Supabase free tiers cover Phase 1 at ~$0/mo baseline; paid tiers kick in around $150/mo at scale
- MCP server in Node reuses the same TypeScript types as the API
- shadcn/ui gives us unopinionated primitives we customize to Rokki tokens — no fighting Material UI or Ant

**Negatives / risks:**
- Vendor lock-in to Supabase (auth + RLS + realtime are tightly coupled)
  - Mitigation: storage adapter, email adapter, LLM adapter interfaces (§09.7). Supabase lock-in is the largest residual risk; migration would be a real project but not existential.
- Next.js App Router still maturing; RSCs have footguns
  - Mitigation: keep RSC usage conservative in Phase 1 (read-only pages); expand when patterns stabilize
- Azure Container Apps cold start for MCP server (~5s)
  - Mitigation: warm replicas; or move to Fly.io Machines if cold start stays problematic
- Realtime: Supabase Realtime scales to ~thousands of concurrent connections per project; beyond that we'd move to Ably/Pusher. Not a Phase 1 concern.

## Alternatives considered

- **Self-hosted Postgres + custom auth:** rejected — months of work for no clear win at our scale.
- **S3 / R2 instead of Azure Blob:** equally viable; chose Azure because users preferring "Microsoft-based" storage for future SharePoint sync option (§BUILD_SPEC §storage).
- **Remix / SvelteKit instead of Next.js:** viable; Next.js chosen because ecosystem + Vercel integration + team familiarity.
- **Turso / Neon / PlanetScale instead of Supabase Postgres:** better DBs in some ways, but Supabase's RLS + realtime + auth bundle is unmatched for this stage.
- **Firebase:** rejected — NoSQL would force us to model relationships in application code, and RLS-equivalents are weaker.

## Revisit

Revisit this ADR if:
- Supabase changes pricing substantially or announces EOL on a core feature
- Realtime scaling becomes a bottleneck (> 1000 concurrent connections)
- Vercel pricing changes for our usage pattern
- An Anthropic-aligned alternative to Supabase emerges

Otherwise, we do not switch stacks mid-phase. Migrations are expensive.
