import { TrashClient } from "./TrashClient";

export const metadata = { title: "Trash — Admin" };
export const dynamic = "force-dynamic";

/**
 * Soft-deleted entities across the platform, grouped by kind. Each row
 * has Restore + Permanent delete actions, plus a "Run purge" control that
 * hard-deletes anything older than 30 days via `purge_expired_trash()`.
 *
 * Auto-purge scheduling is intentionally NOT shipped here — see the
 * migration's docstring. The endpoint is `/api/v1/admin/trash/purge`,
 * the SQL function lives in the database, and an operator can drive
 * either via pg_cron, a Vercel cron route, or a manual click here.
 */
export default function AdminTrashPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-text-0">Trash</h1>
        <p className="mt-1 text-xs text-text-3">
          Soft-deleted tasks, terminals, spaces, files, and comments. Restore
          to bring something back; permanent delete drops it for good after
          a confirm. The purge tool removes anything older than the cutoff
          (default 30 days).
        </p>
      </header>
      <TrashClient />
    </div>
  );
}
