import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Circle,
  ArrowRight,
  Keyboard,
  Calendar,
  User,
  Terminal,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { Wordmark } from "@/components/Wordmark";

export const metadata = {
  title: "Welcome — Rokki",
};

/**
 * Onboarding welcome page. Shown after first sign-in (and linked from the
 * command palette + settings landing). The checklist introspects current
 * user state — items flip to ✓ as they're completed, no manual "mark done"
 * step required.
 *
 * Not force-redirected-to: we don't want to annoy returning users. Linked
 * from the dashboard's first-run state and reachable from /help.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { count: terminalCount },
    { count: spaceCount },
    { count: calendarCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, timezone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("terminal_members")
      .select("terminal_id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("space_members")
      .select("space_id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("calendar_connections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const p = profile as {
    full_name: string | null;
    timezone: string | null;
  } | null;

  const steps: Array<{
    id: string;
    title: string;
    body: string;
    done: boolean;
    cta: { label: string; href: string };
    icon: React.ReactNode;
  }> = [
    {
      id: "profile",
      title: "Complete your profile",
      body: "Name and timezone — so mentions read right and your due dates land in your local time.",
      done: Boolean(p?.full_name && p?.timezone),
      cta: { label: "Open profile", href: "/settings/profile" },
      icon: <User className="h-3.5 w-3.5 text-accent" />,
    },
    {
      id: "space",
      title: "Join or create a space",
      body: "A space is a company, family, or household. Every terminal lives inside one.",
      done: (spaceCount ?? 0) > 0,
      cta: {
        label: (spaceCount ?? 0) > 0 ? "View spaces" : "Go to dashboard",
        href: "/",
      },
      icon: <Sparkles className="h-3.5 w-3.5 text-accent" />,
    },
    {
      id: "terminal",
      title: "Open your first terminal",
      body: "A terminal is a project, matter, client, or goal. It's where tasks, files, and discussion live.",
      done: (terminalCount ?? 0) > 0,
      cta: {
        label: (terminalCount ?? 0) > 0 ? "Go to a terminal" : "Dashboard",
        href: "/",
      },
      icon: <Terminal className="h-3.5 w-3.5 text-accent" />,
    },
    {
      id: "calendar",
      title: "Connect a calendar (optional)",
      body: "Google Calendar or Outlook. Events show up in This Week next to your tasks.",
      done: (calendarCount ?? 0) > 0,
      cta: { label: "Connect", href: "/settings/calendars" },
      icon: <Calendar className="h-3.5 w-3.5 text-accent" />,
    },
    {
      id: "shortcuts",
      title: "Learn the keyboard shortcuts",
      body: "Rokki is keyboard-first. ⌘K opens everything. J/K moves through tasks. ? shows the full cheatsheet.",
      done: false,
      cta: { label: "Open reference", href: "/help" },
      icon: <Keyboard className="h-3.5 w-3.5 text-accent" />,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const first = (p?.full_name ?? user.email ?? "").split(/\s+/)[0];

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <span className="text-text-0">Welcome</span>
      </TopBar>
      <main className="mx-auto w-full max-w-2xl flex-1 p-8">
        <header className="mb-8 flex flex-col items-start gap-2">
          <Wordmark size="lg" />
          <h1 className="font-display mt-2 text-4xl text-text-0">
            Welcome{first ? `, ${first}` : ""}.
          </h1>
          <p className="text-sm text-text-2">
            Rokki is a terminal for your work. Dense, keyboard-first, and
            AI-native. Here&apos;s how to make it yours — it takes about
            90&nbsp;seconds.
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-text-3">
            <span className="font-mono">
              {completed}/{steps.length}
            </span>
            <div className="h-1 w-32 overflow-hidden rounded-full bg-bg-2">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${(completed / steps.length) * 100}%` }}
              />
            </div>
          </div>
        </header>

        <ol className="flex flex-col gap-3">
          {steps.map((s) => (
            <li
              key={s.id}
              className={`overflow-hidden rounded border border-border bg-bg-1 transition-opacity ${s.done ? "opacity-80" : ""}`}
            >
              <Link
                href={s.cta.href}
                className="flex items-start gap-3 px-4 py-3 hover:bg-bg-2"
              >
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  {s.done ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-text-3" />
                  )}
                </span>
                <span className="flex-1">
                  <span className="flex items-center gap-1.5">
                    {s.icon}
                    <span className="text-sm font-medium text-text-0">
                      {s.title}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-text-3">
                    {s.body}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-text-2">
                  {s.cta.label}
                  <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </li>
          ))}
        </ol>

        <footer className="mt-8 flex items-center justify-between text-xs text-text-3">
          <span>
            Questions? <a href="mailto:support@rokki.ai" className="text-accent hover:underline">support@rokki.ai</a>
          </span>
          <Link href="/" className="text-text-2 hover:text-text-0">
            Skip to dashboard →
          </Link>
        </footer>
      </main>
    </div>
  );
}
