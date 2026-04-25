import Link from "next/link";
import { Keyboard, Terminal, BookOpen, MessageSquare } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { KeyHint } from "@/components/ShortcutsOverlay";
import { SHORTCUT_SECTIONS } from "@/lib/shortcuts";

export const metadata = {
  title: "Help — Rokki",
};

/**
 * Help & keyboard-shortcuts reference. Pulls from the same canonical data
 * as the `?` overlay so there's only one list to maintain.
 *
 * Sections:
 *   - TL;DR card with the three shortcuts you'll use most
 *   - Full shortcut tables, one per context
 *   - Concepts primer (spaces, terminals, tasks)
 *   - Links to deeper docs (if we ever publish a public docs site)
 */
export default function HelpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Help</span>
      </TopBar>

      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <header className="mb-6">
          <h1 className="font-display flex items-center gap-3 text-3xl text-text-0">
            <BookOpen className="h-6 w-6 text-accent" />
            Help &amp; keyboard shortcuts
          </h1>
          <p className="mt-1 text-xs text-text-3">
            Rokki is keyboard-first. The faster you learn these, the faster it
            gets.
          </p>
        </header>

        {/* TL;DR */}
        <section
          aria-labelledby="tldr-h"
          className="mb-6 overflow-hidden rounded border border-border bg-bg-1"
        >
          <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <Keyboard className="h-3 w-3" />
            <span id="tldr-h">Start here</span>
          </header>
          <ul className="grid grid-cols-1 gap-0 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            <TldrRow
              keys="⌘K"
              title="Command palette"
              body="Every action, every terminal, every setting — one box."
            />
            <TldrRow
              keys="?"
              title="This cheatsheet"
              body="Press anywhere to pop the shortcuts overlay."
            />
            <TldrRow
              keys="J K"
              title="Navigate tasks"
              body="Vim-style. Enter opens, C creates, ⌘↵ completes."
            />
          </ul>
        </section>

        {/* Concepts */}
        <section
          aria-labelledby="concepts-h"
          className="mb-6 overflow-hidden rounded border border-border bg-bg-1"
        >
          <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <Terminal className="h-3 w-3" />
            <span id="concepts-h">Concepts</span>
          </header>
          <div className="grid grid-cols-1 divide-y divide-border text-sm md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="p-4">
              <h3 className="mb-1 text-text-0">Spaces</h3>
              <p className="text-xs text-text-2">
                A space is a tenant — a company, family, or household. It owns
                its people and its terminals. Only platform administrators
                create spaces.
              </p>
            </div>
            <div className="p-4">
              <h3 className="mb-1 text-text-0">Terminals</h3>
              <p className="text-xs text-text-2">
                A terminal is a working context — a project, matter, client, or
                goal. Tasks, files, and discussion all live inside a terminal.
                Space owners and admins create terminals.
              </p>
            </div>
            <div className="p-4">
              <h3 className="mb-1 text-text-0">Tasks</h3>
              <p className="text-xs text-text-2">
                Any member of a terminal can create tasks, upload files, post
                comments. Every action flows into the ticker and the domain
                event log.
              </p>
            </div>
            <div className="p-4">
              <h3 className="mb-1 text-text-0">Tools</h3>
              <p className="text-xs text-text-2">
                Tools are custom skills other users built — runnable from the
                command palette, from MCP clients, or from task &quot;Run
                tool&quot; actions. Every run is sandboxed and quota-tracked.
              </p>
            </div>
          </div>
        </section>

        {/* Shortcut tables */}
        <nav
          aria-label="Shortcut sections"
          className="mb-4 flex flex-wrap gap-2 text-xs"
        >
          {SHORTCUT_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-sm border border-border bg-bg-1 px-2 py-1 text-text-2 hover:bg-bg-2 hover:text-text-0"
            >
              {s.title}
            </a>
          ))}
        </nav>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SHORTCUT_SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`help-${s.id}-h`}
              className="overflow-hidden rounded border border-border bg-bg-1"
            >
              <header className="border-b border-border bg-bg-2 px-4 py-2">
                <h2
                  id={`help-${s.id}-h`}
                  className="text-[11px] font-semibold uppercase tracking-wide text-text-1"
                >
                  {s.title}
                </h2>
                {s.subtitle ? (
                  <p className="text-[10px] text-text-3">{s.subtitle}</p>
                ) : null}
              </header>
              <ul className="divide-y divide-border text-xs">
                {s.shortcuts.map((sc) => (
                  <li
                    key={sc.description}
                    className="flex items-center gap-3 px-4 py-2"
                  >
                    <span className="flex-1 text-text-1">{sc.description}</span>
                    <KeyHint keys={sc.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Support */}
        <section
          aria-labelledby="support-h"
          className="mt-6 overflow-hidden rounded border border-border bg-bg-1"
        >
          <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <MessageSquare className="h-3 w-3" />
            <span id="support-h">Support</span>
          </header>
          <div className="p-4 text-sm text-text-1">
            <p>
              Found a bug or missing shortcut? File it in the{" "}
              <Link
                href="/settings/events"
                className="text-accent hover:underline"
              >
                domain events
              </Link>{" "}
              log if you&apos;re a platform admin, or email{" "}
              <a
                href="mailto:support@rokki.ai"
                className="text-accent hover:underline"
              >
                support@rokki.ai
              </a>{" "}
              otherwise.
            </p>
            <p className="mt-2 text-xs text-text-3">
              Shortcut docs canonically live in{" "}
              <code className="rounded-sm border border-border bg-bg-2 px-1 font-mono text-[11px]">
                docs/08_UI_DESIGN.md §8.6
              </code>{" "}
              and{" "}
              <code className="rounded-sm border border-border bg-bg-2 px-1 font-mono text-[11px]">
                apps/web/src/lib/shortcuts.ts
              </code>
              .
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function TldrRow({
  keys,
  title,
  body,
}: {
  keys: string;
  title: string;
  body: string;
}) {
  return (
    <li className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2">
        <KeyHint keys={keys} />
        <span className="text-sm text-text-0">{title}</span>
      </div>
      <p className="text-xs text-text-3">{body}</p>
    </li>
  );
}
