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
} from "lucide-react";
import { CommandContext, type Command, type CommandAPI } from "@/lib/commands";
import { createClient } from "@/lib/supabase/client";

interface ProjectHit {
  id: string;
  ticker: string;
  name: string;
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
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/v1/search", { credentials: "include" })
      .then((r) => r.json())
      .then((body: { data?: { projects?: ProjectHit[] } }) => {
        if (!cancelled) setProjects(body.data?.projects ?? []);
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
        icon: <LayoutDashboard className="h-4 w-4" />,
        onRun: go("/"),
      },
      {
        id: "go/tools",
        title: "Tools",
        category: "navigation",
        icon: <Wrench className="h-4 w-4" />,
        onRun: go("/tools"),
      },
      {
        id: "go/settings",
        title: "Settings",
        category: "navigation",
        icon: <Settings className="h-4 w-4" />,
        onRun: go("/settings"),
      },
      {
        id: "go/help",
        title: "Help & keyboard shortcuts",
        subtitle: "Full reference — or press ? anywhere",
        category: "help",
        shortcut: "?",
        icon: <HelpCircle className="h-4 w-4" />,
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
        id: "create/terminal",
        title: "New terminal",
        subtitle: "A working context — project, matter, goal, client",
        category: "action",
        icon: <Plus className="h-4 w-4" />,
        onRun: go("/?new=terminal"),
      },
      {
        id: "create/space",
        title: "New space",
        subtitle: "A company, family, or household (platform admin only)",
        category: "action",
        icon: <Plus className="h-4 w-4" />,
        onRun: go("/?new=space"),
      },
      {
        id: "create/tool",
        title: "New tool",
        subtitle: "Register a custom skill",
        category: "action",
        icon: <Plus className="h-4 w-4" />,
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
    return [...nav, ...projectNav, ...create];
  }, [projects, router]);

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

  // Global hotkey.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          const next = !o;
          notifyOpen(next);
          return next;
        });
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
        />
      ) : null}
    </CommandContext.Provider>
  );
}

function PaletteUI({
  close,
  commands,
}: {
  close: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const g: Record<string, Command[]> = {};
    for (const c of commands) {
      if (!g[c.category]) g[c.category] = [];
      g[c.category].push(c);
    }
    return g;
  }, [commands]);

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
        <CmdkCommand loop shouldFilter>
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 text-text-2" aria-hidden="true" />
            <CmdkCommand.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Type a command, tool, or space…"
              className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
            />
            <kbd className="rounded-sm border border-border bg-bg-3 px-1.5 py-0.5 font-mono text-xs text-text-2">
              Esc
            </kbd>
          </div>
          <CmdkCommand.List className="max-h-[60vh] overflow-y-auto p-2">
            <CmdkCommand.Empty className="px-3 py-6 text-center text-sm text-text-2">
              Nothing matches.
            </CmdkCommand.Empty>
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
          </CmdkCommand.List>
          <div className="border-t border-border bg-bg-2 px-3 py-1.5 text-[10px] text-text-3">
            <span>↵ run</span>
            <span className="mx-2">·</span>
            <span>↑↓ move</span>
            <span className="mx-2">·</span>
            <span>esc close</span>
          </div>
        </CmdkCommand>
      </div>
    </div>
  );
}
