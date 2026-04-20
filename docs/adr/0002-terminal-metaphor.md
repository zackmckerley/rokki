# ADR 0002 — The Terminal metaphor

**Date:** 2026-04-19
**Status:** Accepted

## Context

Project management UIs have converged on a shallow pattern: sidebar nav, board view, modals, cute illustrations. These are optimized for zero-training-needed onboarding at the expense of depth and power.

Rokki's users are professionals who spend hours per day in the product. The optimization target is different: density, speed, and precision matter more than discoverability.

## Decision

Every project in Rokki is presented as a **Rokki Terminal** — a Bloomberg Terminal-inspired, multi-pane, keyboard-driven interface. Specifically:

- 3-pane resizable layout (left/main/right)
- Function-key module navigation (F2-F12)
- Ticker tape of live activity at the top
- Command bar at the bottom for typed commands (`BRKL GO`, `TASK NEW`)
- Dark, information-dense by default
- Keyboard shortcuts for every primary action

The dashboard (cross-project) uses the same visual language.

## Consequences

**Positives:**
- Appears immediately serious and specialized — matches the "software for professionals billing $800/hr" positioning
- Power users reach peak productivity faster (keyboard-first)
- Information density shows respect for user attention — no wasted screen real estate
- Novel but not gimmicky — genuine utility behind the aesthetic

**Negatives / risks:**
- Higher learning curve for non-technical users (architects' assistants, family members using at home)
  - Mitigation: command palette (⌘K) discoverable; every keyboard action has a visible button as alternative
- "Bloomberg Terminal" carries financial-services connotations that don't map to construction
  - Mitigation: modernize the aesthetic with Linear-quality typography; keep "Rokki Terminal" as our term, not "Bloomberg clone"
- Implementation is harder than a standard sidebar + content layout
  - Mitigation: worth it for the differentiation

## Alternatives considered

- **Linear-style sidebar + content pane:** clean, modern, but one of a hundred products using this pattern. No unique identity.
- **Notion-style block editing:** flexibility, but shallow permission model and slower for repetitive task work.
- **Jira / Asana conventional layout:** proven, but the exact thing we're positioned against.

## Revisit

Revisit if:
- User testing (Phase 1 with Zack + 3 initial users) shows the keyboard-first approach is a barrier rather than a boost
- Mobile experience suffers (the terminal metaphor needs significant adaptation on small screens — we accept this trade and give mobile a different UI pattern)
- Adoption outside Zack's immediate circle stalls specifically due to learning curve

At that point, we'd consider a "simple mode" toggle that collapses to a conventional sidebar layout. But the default experience remains the Terminal.
