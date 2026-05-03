"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Command as CmdkCommand } from "cmdk";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Wrench,
  Settings,
  Plus,
  Compass,
  PlayCircle,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  Users,
  Building2,
  Megaphone,
  ToggleLeft,
  Activity,
  HeartPulse,
  CheckSquare,
  FileText,
  MessageSquare,
  Terminal as TerminalIcon,
} from "lucide-react";
import { CommandContext, type Command, type CommandAPI } from "@/lib/commands";
import { createClient } from "@/lib/supabase/client";

interface ProjectHit {
  id: string;
  ticker: string;
  name: string;
}

interface SearchHit {
  kind: "task" | "file" | "comment" | "terminal" | "space";
  id: string;
  title: string;
  snippet: string;
  terminalTicker: string | null;
  terminalId: string | null;
  score: number;
}

/**
 * Global command palette + provider (⌘K / ⌃K).
 *
 *   - Lives at the root of the app tree (wrap children in the provider).
 *   - Scoped contributions via `useRegisterCommands`: panes register their
 *     own actions when mounted, and they disappear on unmount.
 *   - Global defaults: navigation, project quick-switch, settings.
 *
 * See @/lib/commands.ts for the Command shape.
 */
export function CommandPalette({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  /**
   * `initialQuery` is set when the palette is opened via cmd+/, so the
   * caller doesn't have to reach inside. The string itself is shoved into
   * the input so live search starts firing immediately.
   */
  const [initialQuery, setInitialQuery] = useState("");
  const [scopedCommands, setScopedCommands] = useState<
    Record<string, Command[]>
  >({});
  const subscribers = useRef(new Set<() => void>());
  const openSubscribers = useRef(new Set<(o: boolean) => void>());

  const notify = useCallback(() => {
    subscribers.current.forEach((cb) => cb());
  }, []);
  const notifyOpen = useCallback((o: boolean) => {
    openSubscribers.current.forEach((cb) => cb(o));
  }, []);

  const register = useCallback(
    (commands: Command[], scopeId: string) => {
      setScopedCommands((prev) => ({ ...prev, [scopeId]: commands }));
      notify();
      return () => {
        setScopedCommands((prev) => {
          const next = { ...prev };
          delete next[scopeId];
          return next;
        });
        notify();
      };
    },
    [notify],
  );

  const scoped = useMemo(
    () => Object.values(scopedCommands).flat(),
    [scopedCommands],
  );

  // Built-in global commands.
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectHit[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/v1/search", { credentials: "include" })
      .then((r) => r.json())
      .then((body: { data?: { projects?: ProjectHit[] } }) => {
        if (!cancelled) setProjects(body.data?.projects ?? []);
      })
      .catch(() => {});
    // Resolve admin flag once per palette-open. Cheap (cached via /me).
    fetch("/api/v1/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: { is_platform_admin?: boolean } } | null) => {
        if (!cancelled)
          setIsAdmin(Boolean(body?.data?.is_platform_admin));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const built = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      setOpen(false);
      router.push(path);
    };
    const nav: Command[] = [
      {
        id: "go/dashboard",
        title: "Dashboard",
        category: "navigation",
        icon: <LayoutDashboard className="h-3.5 w-3.5" />,
        onRun: go("/"),
      },
      {
        id: "go/tools",
        title: "Tools",
        category: "navigation",
        icon: <Wrench className="h-3.5 w-3.5" />,
        onRun: go("/tools"),
      },
      {
        id: "go/settings",
        title: "Settings",
        category: "navigation",
        icon: <Settings className="h-3.5 w-3.5" />,
        onRun: go("/settings"),
      },
      {
        id: "go/help",
        title: "Help & keyboard shortcuts",
        subtitle: "Full reference — or press ? anywhere",
        category: "help",
        shortcut: "?",
        icon: <HelpCircle className="h-3.5 w-3.5" />,
        onRun: go("/help"),
      },
    ];
    const projectNav: Command[] = projects.map((p) => ({
      id: `go/p/${p.ticker}`,
      title: p.name,
      subtitle: p.ticker,
      category: "navigation",
      keywords: [p.ticker.toLowerCase(), p.name.toLowerCase()],
      icon: (
        <span className="font-mono text-[11px] font-semibold text-accent">
          {p.ticker}
        </span>
      ),
      onRun: go(`/p/${p.ticker}`),
    }));
    const create: Command[] = [
      {
        id: "create/task",
        title: "New task",
        subtitle: "Pick a terminal + chips inline",
        category: "action",
        shortcut: "⌘N",
        icon: <Plus className="h-3.5 w-3.5" />,
        // Route to the dashboard with ?new=task so DashboardClient
        // opens the QuickTaskDialog. From a terminal page this means
        // a one-hop nav back to dashboard, but keeps a single entry
        // point for now — when terminal pages get an inline composer
        // toggle we'll branch on pathname.
        onRun: go("/?new=task"),
      },
      {
        id: "create/terminal",
        title: "New terminal",
        subtitle: "A working context — project, matter, goal, client",
        category: "action",
        icon: <Plus className="h-3.5 w-3.5" />,
        onRun: go("/?new=terminal"),
      },
      {
        id: "create/space",
        title: "New space",
        subtitle: "A company, family, or household (platform admin only)",
        category: "action",
        icon: <Plus className="h-3.5 w-3.5" />,
        onRun: go("/?new=space"),
      },
      {
        id: "create/tool",
        title: "New tool",
        subtitle: "Register a custom skill",
        category: "action",
        icon: <Plus className="h-3.5 w-3.5" />,
        onRun: go("/tools/new"),
      },
      {
        id: "action/sign-out",
        title: "Sign out",
        category: "action",
        onRun: async () => {
          const supa = createClient();
          await supa.auth.signOut();
          router.push("/login");
        },
      },
    ];
    // Admin actions — gated on is_platform_admin so non-admins don't see
    // a list of admin destinations they'd 403 on. Slugged under the
    // "action" category since cmdk renders categories together; we
    // prefix titles so admins can search "admin: …".
    const admin: Command[] = isAdmin
      ? [
          {
            id: "admin/overview",
            title: "Admin: Operator console",
            subtitle: "KPIs, health, recent events",
            category: "action",
            icon: <ShieldCheck className="h-3.5 w-3.5 text-accent" />,
            onRun: go("/admin"),
          },
          {
            id: "admin/users",
            title: "Admin: Users",
            subtitle: "Search, suspend, impersonate",
            category: "action",
            icon: <Users className="h-3.5 w-3.5 text-accent" />,
            onRun: go("/admin/users"),
          },
          {
            id: "admin/users/new",
            title: "Admin: New user",
            category: "action",
            icon: <Plus className="h-3.5 w-3.5 text-accent" />,
            onRun: go("/admin/users/new"),
          },
          {
            id: "admin/spaces",
            title: "Admin: Spaces",
            category: "action",
            icon: <Building2 className="h-3.5 w-3.5 text-accent" />,
            onRun: go("/admin/spaces"),
          },
          {
            id: "admin/spaces/new",
            title: "Admin: New space",
            category: "action",
            icon: <Plus className="h-3.5 w-3.5 text-accent" />,
            onRun: go("/admin/spaces/new"),
          },
          {
            id: "admin/emergency",
            title: "Admin: Emergency access",
            subtitle: "Time-boxed break-glass into a terminal",
            category: "action",
            icon: <ShieldAlert className="h-3.5 w-3.5 text-danger" />,
            onRun: go("/admin/emergency"),
          },
          {
            id: "admin/announcements",
            title: "Admin: Announcements",
            category: "action",
            icon: <Megaphone className="h-3.5 w-3.5 text-accent" />,
            onRun: go("/admin/announcements"),
          },
          {
            id: "admin/flags",
            title: "Admin: Feature flags",
            category: "action",
            icon: <ToggleLeft className="h-3.5 w-3.5 text-accent" />,
            onRun: go("/admin/flags"),
          },
          {
            id: "admin/health",
            title: "Admin: Health",
            category: "action",
            icon: <HeartPulse className="h-3.5 w-3.5 text-accent" />,
            onRun: go("/admin/health"),
          },
          {
            id: "admin/activity",
            title: "Admin: Activity log",
            category: "action",
            icon: <Activity className="h-3.5 w-3.5 text-accent" />,
            onRun: go("/admin/activity"),
          },
        ]
      : [];
    return [...nav, ...projectNav, ...create, ...admin];
  }, [projects, router, isAdmin]);

  const all = useMemo(() => [...built, ...scoped], [built, scoped]);

  const api: CommandAPI = useMemo(
    () => ({
      register,
      all: () => all,
      subscribe: (cb) => {
        subscribers.current.add(cb);
        return () => subscribers.current.delete(cb);
      },
      open: () => {
        setOpen(true);
        notifyOpen(true);
      },
      close: () => {
        setOpen(false);
        notifyOpen(false);
      },
      isOpen: () => open,
      subscribeOpen: (cb) => {
        openSubscribers.current.add(cb);
        return () => openSubscribers.current.delete(cb);
      },
    }),
    [register, all, open, notifyOpen],
  );

  // Global hotkeys.
  //   ⌘K / ⌃K  — toggle palette (commands shown first, search runs as you type)
  //   ⌘/ / ⌃/  — open palette (alias — same UI; future: prepend `/` to bias toward search)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setInitialQuery("");
        setOpen((o) => {
          const next = !o;
          notifyOpen(next);
          return next;
        });
      } else if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setInitialQuery("");
        setOpen(true);
        notifyOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notifyOpen]);

  return (
    <CommandContext.Provider value={api}>
      {children}
      {open ? (
        <PaletteUI
          close={() => {
            setOpen(false);
            notifyOpen(false);
          }}
          commands={all}
          initialQuery={initialQuery}
          router={router}
        />
      ) : null}
    </CommandContext.Provider>
  );
}

function PaletteUI({
  close,
  commands,
  initialQuery,
  router,
}: {
  close: () => void;
  commands: Command[];
  initialQuery: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const lastQueryRef = useRef("");

  // Live search — debounced 200ms. Skip very short queries so we don't
  // hammer the DB on every keystroke; ts-rank requires real tokens anyway.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      lastQueryRef.current = "";
      return;
    }
    setSearchLoading(true);
    const handle = setTimeout(() => {
      const requestId = trimmed;
      lastQueryRef.current = requestId;
      fetch(`/api/v1/search?q=${encodeURIComponent(trimmed)}&limit=20`, {
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : { data: { results: [] } }))
        .then((body: { data?: { results?: SearchHit[] } }) => {
          // Drop stale responses if a newer query has fired in the interim.
          if (lastQueryRef.current !== requestId) return;
          setSearchHits(body.data?.results ?? []);
          setSearchLoading(false);
        })
        .catch(() => {
          if (lastQueryRef.current === requestId) {
            setSearchHits([]);
            setSearchLoading(false);
          }
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const grouped = useMemo(() => {
    const g: Record<string, Command[]> = {};
    for (const c of commands) {
      if (!g[c.category]) g[c.category] = [];
      g[c.category].push(c);
    }
    return g;
  }, [commands]);

  // When a search hit is chosen, navigate to the entity. Comments deep-link
  // to their parent task because /comments/:id isn't routable on its own.
  function navigateHit(hit: SearchHit) {
    const ticker = hit.terminalTicker;
    switch (hit.kind) {
      case "task":
        // We don't carry ticker_seq through the API result; route to the
        // terminal's task list and let the user pick. Cheap, accurate.
        if (ticker) router.push(`/p/${ticker}?task=${hit.id}`);
        break;
      case "file":
        if (ticker) router.push(`/p/${ticker}?file=${hit.id}`);
        break;
      case "comment":
        if (ticker) router.push(`/p/${ticker}?comment=${hit.id}`);
        break;
      case "terminal":
        if (ticker) router.push(`/p/${ticker}`);
        break;
      case "space":
        // No per-space landing yet; admin spaces page is the closest match.
        router.push(`/admin/spaces/${hit.id}`);
        break;
    }
    close();
  }

  // Disable cmdk's built-in fuzzy filter once the user is typing a search
  // query — cmdk hides every command row that doesn't match the input,
  // which would also hide the search hits we render below. We control
  // visibility ourselves in that case.
  const inSearchMode = query.trim().length >= 2;

  return (
    <div
      className="fixed inset-0 z-[1050] flex items-start justify-center bg-bg-0/80 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="mt-24 w-full max-w-xl overflow-hidden rounded-md border border-border bg-bg-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <CmdkCommand loop shouldFilter={!inSearchMode}>
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-3.5 w-3.5 text-text-2" aria-hidden="true" />
            <CmdkCommand.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Type a command, or search tasks, files, comments…"
              className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
            />
            {searchLoading ? (
              <span className="font-mono text-[10px] text-text-3">…</span>
            ) : null}
            <kbd className="rounded-sm border border-border bg-bg-3 px-1.5 py-0.5 font-mono text-xs text-text-2">
              Esc
            </kbd>
          </div>
          <CmdkCommand.List className="max-h-[60vh] overflow-y-auto p-2">
            {!inSearchMode ? (
              <CmdkCommand.Empty className="px-3 py-6 text-center text-sm text-text-2">
                Nothing matches.
              </CmdkCommand.Empty>
            ) : null}
            {(
              [
                ["navigation", "Navigate", Compass],
                ["action", "Actions", PlayCircle],
                ["tool", "Tools", Sparkles],
                ["search", "Search", Search],
                ["help", "Help", HelpCircle],
              ] as const
            ).map(([cat, label, Icon]) =>
              grouped[cat] && grouped[cat].length > 0 ? (
                <CmdkCommand.Group
                  key={cat}
                  heading={
                    <span className="flex items-center gap-1.5 px-2 py-1 text-xs uppercase tracking-wide text-text-3">
                      <Icon className="h-3 w-3" />
                      {label}
                    </span>
                  }
                >
                  {grouped[cat].map((c) => (
                    <CmdkCommand.Item
                      key={c.id}
                      value={[c.title, c.subtitle, ...(c.keywords ?? [])]
                        .filter(Boolean)
                        .join(" ")}
                      onSelect={() => {
                        void c.onRun();
                        close();
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm text-text-1 aria-selected:bg-accent-subtle aria-selected:text-text-0"
                    >
                      <span className="flex h-5 w-8 items-center justify-center text-text-2">
                        {c.icon}
                      </span>
                      <span className="flex-1 truncate">{c.title}</span>
                      {c.subtitle ? (
                        <span className="truncate text-xs text-text-3">
                          {c.subtitle}
                        </span>
                      ) : null}
                      {c.shortcut ? (
                        <kbd className="rounded-sm border border-border bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] text-text-2">
                          {c.shortcut}
                        </kbd>
                      ) : null}
                    </CmdkCommand.Item>
                  ))}
                </CmdkCommand.Group>
              ) : null,
            )}

            {inSearchMode ? (
              <SearchResultsSection
                hits={searchHits}
                loading={searchLoading}
                query={query.trim()}
                onPick={navigateHit}
              />
            ) : null}
          </CmdkCommand.List>
          <div className="border-t border-border bg-bg-2 px-3 py-1.5 text-[10px] text-text-3">
            <span>↵ run</span>
            <span className="mx-2">·</span>
            <span>↑↓ move</span>
            <span className="mx-2">·</span>
            <span>esc close</span>
            <span className="mx-2">·</span>
            <span>⌘/ search</span>
          </div>
        </CmdkCommand>
      </div>
    </div>
  );
}

/** Icon mapping per result kind — reuse what other panes use so it reads naturally. */
function kindIcon(kind: SearchHit["kind"]): ReactNode {
  switch (kind) {
    case "task":
      return <CheckSquare className="h-4 w-4" />;
    case "file":
      return <FileText className="h-4 w-4" />;
    case "comment":
      return <MessageSquare className="h-4 w-4" />;
    case "terminal":
      return <TerminalIcon className="h-4 w-4" />;
    case "space":
      return <Building2 className="h-4 w-4" />;
  }
}

function SearchResultsSection({
  hits,
  loading,
  query,
  onPick,
}: {
  hits: SearchHit[];
  loading: boolean;
  query: string;
  onPick: (hit: SearchHit) => void;
}) {
  // Group by kind so the visual hierarchy stays put even as the score
  // ordering shuffles. Headings only render when the section has content.
  const byKind = useMemo(() => {
    const g: Record<SearchHit["kind"], SearchHit[]> = {
      task: [],
      file: [],
      comment: [],
      terminal: [],
      space: [],
    };
    for (const h of hits) g[h.kind].push(h);
    return g;
  }, [hits]);

  if (loading && hits.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-text-3">
        Searching…
      </div>
    );
  }
  if (!loading && hits.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-text-3">
        No results for{" "}
        <span className="font-mono text-text-2">{query}</span>.
      </div>
    );
  }

  const sections: { kind: SearchHit["kind"]; label: string }[] = [
    { kind: "task", label: "Tasks" },
    { kind: "file", label: "Files" },
    { kind: "comment", label: "Comments" },
    { kind: "terminal", label: "Terminals" },
    { kind: "space", label: "Spaces" },
  ];

  return (
    <>
      {sections.map(({ kind, label }) =>
        byKind[kind].length > 0 ? (
          <CmdkCommand.Group
            key={`search:${kind}`}
            heading={
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs uppercase tracking-wide text-text-3">
                <Search className="h-3 w-3" />
                {label}
              </span>
            }
          >
            {byKind[kind].map((hit) => (
              <CmdkCommand.Item
                key={`${hit.kind}:${hit.id}`}
                value={`__search__::${hit.kind}::${hit.id}`}
                onSelect={() => onPick(hit)}
                className="flex cursor-pointer items-start gap-3 rounded px-2 py-2 text-sm text-text-1 aria-selected:bg-accent-subtle aria-selected:text-text-0"
              >
                <span className="mt-0.5 flex h-5 w-8 items-center justify-center text-text-2">
                  {kindIcon(hit.kind)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="truncate font-medium text-text-0">
                    {hit.title || "(untitled)"}
                  </span>
                  {hit.snippet ? (
                    <span
                      className="mt-0.5 line-clamp-2 text-xs text-text-2 [&_mark.rk-hit]:rounded-sm [&_mark.rk-hit]:bg-accent-subtle [&_mark.rk-hit]:px-0.5 [&_mark.rk-hit]:text-accent"
                      // ts_headline returns server-side HTML-escaped text
                      // wrapped in <mark class="rk-hit">. Safe to render
                      // because ts_headline escapes everything else.
                      dangerouslySetInnerHTML={{ __html: hit.snippet }}
                    />
                  ) : null}
                </span>
                {hit.terminalTicker ? (
                  <span className="ml-2 mt-1 flex-shrink-0 font-mono text-[10px] text-text-3">
                    {hit.terminalTicker}
                  </span>
                ) : null}
              </CmdkCommand.Item>
            ))}
          </CmdkCommand.Group>
        ) : null,
      )}
    </>
  );
}
