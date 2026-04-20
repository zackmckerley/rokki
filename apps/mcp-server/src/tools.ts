import crypto from "node:crypto";
import { admin, type AuthedSession } from "./auth.js";
import {
  isValidFolderName,
  joinPath,
  normalizePath,
} from "./folder-path.js";
import { isValidTicker, suggestTicker, uniqueTicker } from "./ticker.js";

/**
 * Tool registry. Covers the full read + write surface of Rokki so an LLM
 * client can drive the terminal end-to-end: spaces, tasks, files, folders,
 * members, activity.
 *
 * All write tools set `requiresWrite: true` so a read-only token can still
 * safely list things without being able to mutate.
 */

type ActivityAction =
  | "terminal.create"
  | "terminal.update"
  | "terminal.archive"
  | "member.invite"
  | "member.join"
  | "task.create"
  | "task.update"
  | "task.complete"
  | "task.delete"
  | "file.upload"
  | "file.update"
  | "file.delete"
  | "file.download";

async function logActivity(
  session: AuthedSession,
  project: ProjectRef,
  action: ActivityAction,
  opts: {
    entity_type?: string;
    entity_id?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await admin.from("activity").insert({
      terminal_id: project.id,
      space_id: project.space_id,
      actor_id: session.userId,
      actor_token_id: session.tokenId,
      action,
      entity_type: opts.entity_type ?? null,
      entity_id: opts.entity_id ?? null,
      metadata: { via: "mcp", ...(opts.metadata ?? {}) },
    });
  } catch (e) {
    console.error("[mcp] activity write failed:", e);
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiresWrite?: boolean;
  handler: (
    args: Record<string, unknown>,
    session: AuthedSession,
  ) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;
}

const TOOLS: ToolDefinition[] = [
  {
    name: "rokki_list_terminals",
    description:
      "List all spaces (projects, matters, households) the user has access to.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (_args, session) => {
      const rows = await loadAccessibleProjects(session);
      if (rows.length === 0) {
        return textResult("You have no spaces yet. Create one at rokki.ai.");
      }
      const lines = rows.map(
        (r) => `• ${r.name} (${r.ticker}) — ${r.status}`,
      );
      return textResult(lines.join("\n"));
    },
  },

  {
    name: "rokki_list_tasks",
    description:
      "List tasks in a specific terminal. Pass the space's ticker or name.",
    inputSchema: {
      type: "object",
      properties: {
        terminal: {
          type: "string",
          description: "Ticker (e.g. BRKL) or exact name of the terminal.",
        },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "blocked", "review", "done"],
          description: "Optional: filter by status.",
        },
      },
      required: ["terminal"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const terminalArg = String(args.terminal ?? "").trim();
      if (!terminalArg) return textResult("Please provide a space name or ticker.");
      const project = await resolveProject(session, terminalArg);
      if (!project) return textResult(`Space "${terminalArg}" not found.`, true);

      let query = admin
        .from("tasks")
        .select("ticker_seq, title, status, priority, due_date, completed_at")
        .eq("terminal_id", project.id);
      if (args.status) {
        const s = String(args.status) as
          | "todo"
          | "in_progress"
          | "blocked"
          | "review"
          | "done";
        query = query.eq("status", s);
      }
      const { data } = await query
        .order("status", { ascending: true })
        .order("priority", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      type TaskRow = {
        ticker_seq: number;
        title: string;
        status: string;
        priority: number;
        due_date: string | null;
      };
      const tasks = (data ?? []) as TaskRow[];
      if (tasks.length === 0)
        return textResult(`No tasks in ${project.name}.`);

      const lines = tasks.map((t) => {
        const done = t.status === "done" ? "✓" : "•";
        const prio = "!".repeat(5 - t.priority); // 1 = urgent (!!!!), 4 = low (!)
        const due = t.due_date ? ` (due ${t.due_date})` : "";
        return `${done} ${prio} ${t.title} [${t.status}]${due}`;
      });
      return textResult(
        `${project.name} — ${tasks.length} task${tasks.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
      );
    },
  },

  {
    name: "rokki_create_task",
    description: "Create a new task in a terminal. Requires write scope.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string", description: "Terminal ticker or name." },
        title: { type: "string", description: "Task title (required)." },
        priority: {
          type: "integer",
          minimum: 1,
          maximum: 4,
          description: "1 = urgent, 2 = high, 3 = normal, 4 = low (default 3).",
        },
        due_date: {
          type: "string",
          format: "date",
          description: "ISO date YYYY-MM-DD, optional.",
        },
      },
      required: ["terminal", "title"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const terminalArg = String(args.terminal ?? "").trim();
      const title = String(args.title ?? "").trim();
      if (!terminalArg || !title)
        return textResult("space and title are required.", true);

      const project = await resolveProject(session, terminalArg);
      if (!project) return textResult(`Space "${terminalArg}" not found.`, true);

      const priorityRaw = args.priority;
      const priority =
        typeof priorityRaw === "number" && priorityRaw >= 1 && priorityRaw <= 4
          ? priorityRaw
          : 3;

      const result = await admin
        .from("tasks")
        // ticker_seq is auto-assigned by the trg_task_ticker trigger; the
        // generated types don't know that, so we cast the insert payload.
        .insert({
          terminal_id: project.id,
          title: title.slice(0, 300),
          priority,
          due_date: args.due_date ? String(args.due_date) : null,
          created_by: session.userId,
          ticker_seq: 0,
        })
        .select("ticker_seq, title, status, priority, due_date")
        .single();

      if (result.error || !result.data) {
        return textResult(
          `Could not create task: ${result.error?.message ?? "unknown error"}`,
          true,
        );
      }

      await admin
        .from("activity")
        .insert({
          terminal_id: project.id,
          space_id: project.space_id,
          actor_id: session.userId,
          actor_token_id: session.tokenId,
          action: "task.create",
          entity_type: "task",
          metadata: { title, via: "mcp" },
        });

      const t = result.data as {
        ticker_seq: number;
        title: string;
        priority: number;
        due_date: string | null;
      };
      return textResult(
        `Created task "${t.title}" in ${project.name} (priority ${t.priority}${t.due_date ? `, due ${t.due_date}` : ""}).`,
      );
    },
  },

  {
    name: "rokki_complete_task",
    description:
      "Mark a task as done. Identify it by space + ticker_seq (e.g. task 7 in BRKL).",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        seq: {
          type: "integer",
          description: "The numeric ticker_seq shown when listing tasks.",
        },
      },
      required: ["terminal", "seq"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);
      const seq = Number(args.seq);
      if (!Number.isInteger(seq))
        return textResult("seq must be an integer.", true);

      const { data } = await admin
        .from("tasks")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
        })
        .eq("terminal_id", project.id)
        .eq("ticker_seq", seq)
        .select("title")
        .maybeSingle();
      if (!data)
        return textResult(`No task #${seq} in ${project.name}.`, true);
      return textResult(`Marked "${(data as { title: string }).title}" done.`);
    },
  },

  {
    name: "rokki_update_task",
    description:
      "Update a task's title, status, priority, or due date. Pass only the fields you want to change.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        seq: { type: "integer" },
        title: { type: "string" },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "blocked", "review", "done"],
        },
        priority: { type: "integer", minimum: 1, maximum: 4 },
        due_date: {
          type: ["string", "null"],
          description: "ISO date or null to clear.",
        },
      },
      required: ["terminal", "seq"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const seq = Number(args.seq);
      const patch: Record<string, unknown> = {};
      if (typeof args.title === "string" && args.title.trim()) {
        patch.title = args.title.trim().slice(0, 300);
      }
      if (typeof args.status === "string") patch.status = args.status;
      if (typeof args.priority === "number") patch.priority = args.priority;
      if (args.due_date !== undefined) {
        patch.due_date =
          args.due_date === null || args.due_date === ""
            ? null
            : String(args.due_date);
      }
      if (patch.status === "done") {
        patch.completed_at = new Date().toISOString();
      } else if (patch.status) {
        patch.completed_at = null;
      }
      if (Object.keys(patch).length === 0)
        return textResult("Nothing to update.", true);

      const { data, error } = await admin
        .from("tasks")
        // @ts-expect-error Phase 0 — generic update payload collapses to never
        .update(patch)
        .eq("terminal_id", project.id)
        .eq("ticker_seq", seq)
        .select("title, status, priority, due_date")
        .maybeSingle();
      if (error || !data)
        return textResult(
          `Task #${seq} not found or update failed.`,
          true,
        );
      const t = data as {
        title: string;
        status: string;
        priority: number;
        due_date: string | null;
      };
      return textResult(
        `Updated "${t.title}" — status: ${t.status}, priority: ${t.priority}${t.due_date ? `, due ${t.due_date}` : ""}.`,
      );
    },
  },

  {
    name: "rokki_list_files",
    description:
      "List files in a space. Pass folder to scope to a subfolder (default: root '/').",
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        folder: {
          type: "string",
          description: "Folder path, e.g. '/drawings'. Defaults to root '/'.",
        },
      },
      required: ["terminal"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const folder = String(args.folder ?? "/");

      const [{ data: files }, { data: folders }] = await Promise.all([
        admin
          .from("files")
          .select("filename, size_bytes, mime_type, folder")
          .eq("terminal_id", project.id)
          .is("deleted_at", null)
          .eq("folder", folder)
          .order("uploaded_at", { ascending: false }),
        admin
          .from("folders")
          .select("name, path")
          .eq("terminal_id", project.id)
          .is("deleted_at", null)
          .eq("parent_path", folder)
          .order("name"),
      ]);

      type F = { filename: string; size_bytes: number; mime_type: string };
      type D = { name: string; path: string };
      const lines: string[] = [];
      for (const d of (folders ?? []) as D[]) lines.push(`📁 ${d.name}/`);
      for (const f of (files ?? []) as F[])
        lines.push(`📄 ${f.filename} (${humanSize(f.size_bytes)})`);

      if (lines.length === 0)
        return textResult(
          `${project.name}${folder === "/" ? "" : ` › ${folder}`} is empty.`,
        );
      return textResult(
        `${project.name}${folder === "/" ? "" : ` › ${folder}`}:\n${lines.join("\n")}`,
      );
    },
  },

  {
    name: "rokki_read_file",
    description:
      "Read a file's contents as text. Text files (txt, md, json, csv, yaml, xml, html, code) up to 200 KB are returned verbatim. PDFs are extracted page-by-page and returned as plain text (up to ~1 MB source). Images / office docs return a summary line only.",
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        filename: {
          type: "string",
          description: "Full filename (e.g. 'contract.pdf').",
        },
        folder: {
          type: "string",
          description: "Folder containing the file (default '/').",
        },
      },
      required: ["terminal", "filename"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const folder = String(args.folder ?? "/");
      const filename = String(args.filename ?? "").trim();
      if (!filename) return textResult("filename is required.", true);

      const { data } = await admin
        .from("files")
        .select("id, filename, size_bytes, mime_type, blob_key")
        .eq("terminal_id", project.id)
        .eq("folder", folder)
        .eq("filename", filename)
        .is("deleted_at", null)
        .maybeSingle();

      const file = data as
        | {
            id: string;
            filename: string;
            size_bytes: number;
            mime_type: string;
            blob_key: string;
          }
        | null;
      if (!file)
        return textResult(
          `File not found: ${folder === "/" ? "" : folder + "/"}${filename}`,
          true,
        );

      const storage = await import("./storage.js");
      const isPdf =
        file.mime_type === "application/pdf" ||
        file.filename.toLowerCase().endsWith(".pdf");

      // PDF branch — extract text with unpdf.
      if (isPdf) {
        if (file.size_bytes > 1024 * 1024) {
          return textResult(
            `${file.filename} is ${humanSize(file.size_bytes)} — larger than the 1 MB PDF cap. Split it up or ask for a specific page range in a later slice.`,
            true,
          );
        }
        const buf = await storage.getObjectBytes(file.blob_key);
        try {
          const { extractText, getDocumentProxy } = await import("unpdf");
          const pdf = await getDocumentProxy(new Uint8Array(buf));
          const { text, totalPages } = await extractText(pdf, {
            mergePages: true,
          });
          const body =
            typeof text === "string" ? text : (text as string[]).join("\n\n");
          const trimmed = body.length > 200_000 ? body.slice(0, 200_000) + "\n\n…[truncated]…" : body;
          await logActivity(session, project, "file.download", {
            entity_type: "file",
            entity_id: file.id,
            metadata: { filename: file.filename, via: "mcp", pdf_pages: totalPages },
          });
          return textResult(
            `--- ${file.filename} (${humanSize(file.size_bytes)} · ${totalPages} page${totalPages === 1 ? "" : "s"}) ---\n${trimmed}`,
          );
        } catch (e) {
          return textResult(
            `Could not extract text from ${file.filename}: ${e instanceof Error ? e.message : "parser error"}`,
            true,
          );
        }
      }

      if (!isText(file.mime_type, file.filename)) {
        return textResult(
          `${file.filename} is ${file.mime_type || "binary"} (${humanSize(file.size_bytes)}). Text extraction for this file type isn't available yet.`,
        );
      }

      if (file.size_bytes > 200 * 1024) {
        return textResult(
          `${file.filename} is ${humanSize(file.size_bytes)} — larger than the 200 KB read cap. Split the file or ask for a summary.`,
          true,
        );
      }

      const buf = await storage.getObjectBytes(file.blob_key);
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      await logActivity(session, project, "file.download", {
        entity_type: "file",
        entity_id: file.id,
        metadata: { filename: file.filename, via: "mcp" },
      });
      return textResult(
        `--- ${file.filename} (${humanSize(file.size_bytes)}) ---\n${text}`,
      );
    },
  },

  {
    name: "rokki_list_members",
    description: "List everyone with access to a space, with their role.",
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
      },
      required: ["terminal"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const { data: members } = await admin
        .from("terminal_members")
        .select("role, user_id, added_at")
        .eq("terminal_id", project.id)
        .order("added_at", { ascending: true });

      type M = { role: string; user_id: string };
      const rows = (members ?? []) as M[];
      const ids = rows.map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await admin
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", ids)
        : { data: [] };
      type P = { user_id: string; full_name: string | null };
      const byId = new Map(
        ((profiles ?? []) as P[]).map((p) => [p.user_id, p]),
      );

      const { data: invites } = await admin
        .from("invites")
        .select("email, role, invited_at")
        .eq("terminal_id", project.id)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString());
      type I = { email: string; role: string };

      const memberLines = rows.map(
        (m) => `• ${byId.get(m.user_id)?.full_name ?? m.user_id} — ${m.role}`,
      );
      const inviteLines = ((invites ?? []) as I[]).map(
        (i) => `• ${i.email} (pending) — ${i.role}`,
      );
      const all = [...memberLines, ...inviteLines];
      if (all.length === 0) return textResult("No members yet.");
      return textResult(
        `${project.name} — ${memberLines.length} member${memberLines.length === 1 ? "" : "s"}${inviteLines.length ? ` + ${inviteLines.length} pending` : ""}:\n${all.join("\n")}`,
      );
    },
  },

  {
    name: "rokki_invite_member",
    description:
      "Invite someone to a space by email. They'll get a magic-link email that auto-accepts on sign-in. Only space owners and managers can invite.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        email: { type: "string" },
        role: {
          type: "string",
          enum: ["owner", "manager", "guest"],
          description: "Default: guest.",
        },
      },
      required: ["terminal", "email"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      // Check caller is owner/manager
      const { data: me } = await admin
        .from("terminal_members")
        .select("role")
        .eq("terminal_id", project.id)
        .eq("user_id", session.userId)
        .maybeSingle();
      const myRole = (me as { role: string } | null)?.role;
      if (!myRole || !["owner", "manager"].includes(myRole)) {
        return textResult(
          "Only owners and managers can invite members.",
          true,
        );
      }

      const email = String(args.email ?? "").trim().toLowerCase();
      if (!email || !/^\S+@\S+\.\S+$/.test(email))
        return textResult("Valid email is required.", true);

      const role = (args.role as "owner" | "manager" | "guest") ?? "guest";

      // Existing user? Add directly.
      const { data: existingUsers } = await admin.auth.admin.listUsers();
      const existing = existingUsers?.users.find(
        (u) => u.email?.toLowerCase() === email,
      );

      if (existing) {
        const { data: alreadyIn } = await admin
          .from("terminal_members")
          .select("user_id")
          .eq("terminal_id", project.id)
          .eq("user_id", existing.id)
          .maybeSingle();
        if (alreadyIn)
          return textResult(`${email} is already on ${project.name}.`);
        await admin.from("terminal_members").insert({
          terminal_id: project.id,
          user_id: existing.id,
          role,
          added_by: session.userId,
        });
        return textResult(`Added ${email} to ${project.name} as ${role}.`);
      }

      // Create pending invite + send magic link
      const { default: crypto } = await import("node:crypto");
      const token = crypto.randomBytes(32).toString("base64url");
      await admin.from("invites").insert({
        email,
        terminal_id: project.id,
        role,
        token,
        invited_by: session.userId,
      });
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${appUrl}/auth/callback?redirect_to=${encodeURIComponent(
            `/p/${project.ticker}`,
          )}`,
        },
      );
      if (sendErr && sendErr.status !== 422) {
        // 422 = user exists; not worth failing the flow for
        return textResult(
          `Invite row created but email send failed: ${sendErr.message}`,
          true,
        );
      }
      return textResult(
        `Invited ${email} to ${project.name} as ${role}. They'll get a sign-in link.`,
      );
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Folder control                                                            */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_create_folder",
    description:
      "Create a new folder inside a space. `parent` is the folder path to create inside (default '/'). Names may contain letters, digits, spaces, and _-.&()",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        name: { type: "string", description: "Folder name (1–60 chars)." },
        parent: {
          type: "string",
          description: "Parent folder path, e.g. '/drawings'. Default '/'.",
        },
      },
      required: ["terminal", "name"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const name = String(args.name ?? "").trim();
      if (!isValidFolderName(name))
        return textResult(
          "Folder name must be 1–60 chars (letters, digits, spaces, -_.&()).",
          true,
        );
      const parentPath = normalizePath(String(args.parent ?? "/"));
      const path = joinPath(parentPath, name);

      // Parent must exist (unless it's root)
      if (parentPath !== "/") {
        const { data: parentRow } = await admin
          .from("folders")
          .select("id")
          .eq("terminal_id", project.id)
          .eq("path", parentPath)
          .is("deleted_at", null)
          .maybeSingle();
        if (!parentRow)
          return textResult(`Parent folder not found: ${parentPath}`, true);
      }

      // No collision
      const { data: existing } = await admin
        .from("folders")
        .select("id")
        .eq("terminal_id", project.id)
        .eq("path", path)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing)
        return textResult(`Folder already exists at ${path}.`, true);

      const { data, error } = await admin
        .from("folders")
        .insert({
          terminal_id: project.id,
          name,
          path,
          parent_path: parentPath,
          created_by: session.userId,
        })
        .select("id, path, name, parent_path")
        .single();
      if (error || !data)
        return textResult(
          `Could not create folder: ${error?.message ?? "unknown"}`,
          true,
        );

      const row = data as { id: string; path: string };
      await logActivity(session, project, "file.upload", {
        entity_type: "folder",
        entity_id: row.id,
        metadata: { path: row.path, op: "folder.create" },
      });
      return textResult(`Created folder ${row.path} in ${project.name}.`);
    },
  },

  {
    name: "rokki_rename_folder",
    description:
      "Rename a folder. Cascades to all descendant folders and contained files. Identify the folder by its current path, e.g. '/drawings/old-name'.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        path: {
          type: "string",
          description: "Current folder path, e.g. '/drawings/v1'.",
        },
        new_name: {
          type: "string",
          description: "New folder name (1–60 chars). Not a full path.",
        },
      },
      required: ["terminal", "path", "new_name"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const current = normalizePath(String(args.path ?? ""));
      if (current === "/")
        return textResult("Cannot rename the root folder.", true);
      const newName = String(args.new_name ?? "").trim();
      if (!isValidFolderName(newName))
        return textResult(
          "new_name must be 1–60 chars (letters, digits, spaces, -_.&()).",
          true,
        );

      const { data: folderRow } = await admin
        .from("folders")
        .select("id, parent_path, path")
        .eq("terminal_id", project.id)
        .eq("path", current)
        .is("deleted_at", null)
        .maybeSingle();
      const folder = folderRow as
        | { id: string; parent_path: string; path: string }
        | null;
      if (!folder) return textResult(`Folder not found: ${current}`, true);

      const newPath = joinPath(folder.parent_path, newName);
      if (newPath === folder.path)
        return textResult(`Folder already named ${newName}.`);

      // Collision check
      const { data: conflict } = await admin
        .from("folders")
        .select("id")
        .eq("terminal_id", project.id)
        .eq("path", newPath)
        .is("deleted_at", null)
        .maybeSingle();
      if (conflict)
        return textResult(
          `A folder already exists at ${newPath}.`,
          true,
        );

      const oldPrefix = folder.path + "/";
      const newPrefix = newPath + "/";

      try {
        await admin
          .from("folders")
          .update({ path: newPath, name: newName })
          .eq("id", folder.id);

        const { data: descendants } = await admin
          .from("folders")
          .select("id, path, parent_path")
          .eq("terminal_id", project.id)
          .is("deleted_at", null)
          .like("path", `${oldPrefix}%`);

        type FD = { id: string; path: string; parent_path: string };
        for (const row of (descendants ?? []) as FD[]) {
          const nextPath = newPrefix + row.path.slice(oldPrefix.length);
          const nextParent =
            row.parent_path === folder.path
              ? newPath
              : row.parent_path.startsWith(oldPrefix)
                ? newPrefix + row.parent_path.slice(oldPrefix.length)
                : row.parent_path;
          await admin
            .from("folders")
            .update({ path: nextPath, parent_path: nextParent })
            .eq("id", row.id);
        }

        const { data: files } = await admin
          .from("files")
          .select("id, folder")
          .eq("terminal_id", project.id)
          .or(`folder.eq.${folder.path},folder.like.${oldPrefix}%`);
        type FF = { id: string; folder: string };
        for (const row of (files ?? []) as FF[]) {
          const nextFolder =
            row.folder === folder.path
              ? newPath
              : newPrefix + row.folder.slice(oldPrefix.length);
          await admin
            .from("files")
            .update({ folder: nextFolder })
            .eq("id", row.id);
        }
      } catch (e) {
        return textResult(
          `Rename cascade failed: ${e instanceof Error ? e.message : "unknown"}`,
          true,
        );
      }

      await logActivity(session, project, "file.update", {
        entity_type: "folder",
        entity_id: folder.id,
        metadata: { from: folder.path, to: newPath, op: "folder.rename" },
      });
      return textResult(`Renamed ${folder.path} → ${newPath}.`);
    },
  },

  {
    name: "rokki_delete_folder",
    description:
      "Move a folder and everything inside it to the trash. Soft delete — contents are recoverable via the web Trash.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        path: { type: "string", description: "Folder path, e.g. '/archive'." },
      },
      required: ["terminal", "path"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const path = normalizePath(String(args.path ?? ""));
      if (path === "/")
        return textResult("Cannot delete the root folder.", true);

      const { data: folderRow } = await admin
        .from("folders")
        .select("id")
        .eq("terminal_id", project.id)
        .eq("path", path)
        .is("deleted_at", null)
        .maybeSingle();
      const folder = folderRow as { id: string } | null;
      if (!folder) return textResult(`Folder not found: ${path}`, true);

      const stamp = new Date().toISOString();
      const prefix = path + "/";

      try {
        await admin
          .from("folders")
          .update({ deleted_at: stamp })
          .eq("id", folder.id);

        await admin
          .from("folders")
          .update({ deleted_at: stamp })
          .eq("terminal_id", project.id)
          .is("deleted_at", null)
          .like("path", `${prefix}%`);

        await admin
          .from("files")
          .update({ deleted_at: stamp })
          .eq("terminal_id", project.id)
          .is("deleted_at", null)
          .or(`folder.eq.${path},folder.like.${prefix}%`);
      } catch (e) {
        return textResult(
          `Delete cascade failed: ${e instanceof Error ? e.message : "unknown"}`,
          true,
        );
      }

      await logActivity(session, project, "file.delete", {
        entity_type: "folder",
        entity_id: folder.id,
        metadata: { path, cascade: true },
      });
      return textResult(`Moved ${path} and its contents to the trash.`);
    },
  },

  /* ----------------------------------------------------------------------- */
  /* File mutation                                                             */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_rename_file",
    description:
      "Rename a file. The underlying blob stays put — only the displayed filename changes.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        filename: { type: "string" },
        folder: {
          type: "string",
          description: "Folder containing the file (default '/').",
        },
        new_name: {
          type: "string",
          description: "New filename including extension, e.g. 'signed.pdf'.",
        },
      },
      required: ["terminal", "filename", "new_name"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const folder = normalizePath(String(args.folder ?? "/"));
      const currentName = String(args.filename ?? "").trim();
      const newName = String(args.new_name ?? "").trim();
      if (!currentName || !newName)
        return textResult("filename and new_name are required.", true);
      if (newName.length > 255 || newName.includes("/"))
        return textResult("new_name must be ≤ 255 chars and cannot contain '/'.", true);

      const { data: row } = await admin
        .from("files")
        .select("id, filename")
        .eq("terminal_id", project.id)
        .eq("folder", folder)
        .eq("filename", currentName)
        .is("deleted_at", null)
        .maybeSingle();
      const file = row as { id: string; filename: string } | null;
      if (!file)
        return textResult(
          `File not found: ${prettyPath(folder, currentName)}`,
          true,
        );

      const { data: clash } = await admin
        .from("files")
        .select("id")
        .eq("terminal_id", project.id)
        .eq("folder", folder)
        .eq("filename", newName)
        .is("deleted_at", null)
        .maybeSingle();
      if (clash)
        return textResult(
          `A file named ${newName} already exists in ${folder}.`,
          true,
        );

      const { error } = await admin
        .from("files")
        .update({ filename: newName })
        .eq("id", file.id);
      if (error)
        return textResult(`Rename failed: ${error.message}`, true);

      await logActivity(session, project, "file.update", {
        entity_type: "file",
        entity_id: file.id,
        metadata: { from: currentName, to: newName, op: "file.rename" },
      });
      return textResult(`Renamed ${currentName} → ${newName}.`);
    },
  },

  {
    name: "rokki_move_file",
    description: "Move a file to a different folder inside the same space.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        filename: { type: "string" },
        folder: {
          type: "string",
          description: "Source folder (default '/').",
        },
        dest_folder: {
          type: "string",
          description: "Destination folder path, e.g. '/archive'.",
        },
      },
      required: ["terminal", "filename", "dest_folder"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const srcFolder = normalizePath(String(args.folder ?? "/"));
      const destFolder = normalizePath(String(args.dest_folder ?? ""));
      const filename = String(args.filename ?? "").trim();
      if (!filename) return textResult("filename is required.", true);
      if (srcFolder === destFolder)
        return textResult("Source and destination folders are the same.", true);

      // Dest must exist (unless root)
      if (destFolder !== "/") {
        const { data: destRow } = await admin
          .from("folders")
          .select("id")
          .eq("terminal_id", project.id)
          .eq("path", destFolder)
          .is("deleted_at", null)
          .maybeSingle();
        if (!destRow)
          return textResult(`Destination folder not found: ${destFolder}`, true);
      }

      const { data: row } = await admin
        .from("files")
        .select("id")
        .eq("terminal_id", project.id)
        .eq("folder", srcFolder)
        .eq("filename", filename)
        .is("deleted_at", null)
        .maybeSingle();
      const file = row as { id: string } | null;
      if (!file)
        return textResult(
          `File not found: ${prettyPath(srcFolder, filename)}`,
          true,
        );

      const { data: clash } = await admin
        .from("files")
        .select("id")
        .eq("terminal_id", project.id)
        .eq("folder", destFolder)
        .eq("filename", filename)
        .is("deleted_at", null)
        .maybeSingle();
      if (clash)
        return textResult(
          `A file named ${filename} already exists in ${destFolder}.`,
          true,
        );

      const { error } = await admin
        .from("files")
        .update({ folder: destFolder })
        .eq("id", file.id);
      if (error)
        return textResult(`Move failed: ${error.message}`, true);

      await logActivity(session, project, "file.update", {
        entity_type: "file",
        entity_id: file.id,
        metadata: { from: srcFolder, to: destFolder, op: "file.move" },
      });
      return textResult(
        `Moved ${filename}: ${srcFolder} → ${destFolder}.`,
      );
    },
  },

  {
    name: "rokki_duplicate_file",
    description:
      "Duplicate a file in place. The copy lands in the same folder with '(copy)' appended.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        filename: { type: "string" },
        folder: { type: "string", description: "Default '/'." },
      },
      required: ["terminal", "filename"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const folder = normalizePath(String(args.folder ?? "/"));
      const filename = String(args.filename ?? "").trim();
      if (!filename) return textResult("filename is required.", true);

      const { data: row } = await admin
        .from("files")
        .select(
          "id, filename, folder, mime_type, size_bytes, blob_key, sha256, uploaded_by, version",
        )
        .eq("terminal_id", project.id)
        .eq("folder", folder)
        .eq("filename", filename)
        .is("deleted_at", null)
        .maybeSingle();
      const src = row as
        | {
            id: string;
            filename: string;
            folder: string;
            mime_type: string;
            size_bytes: number;
            blob_key: string;
            sha256: string;
            uploaded_by: string;
            version: number;
          }
        | null;
      if (!src)
        return textResult(
          `File not found: ${prettyPath(folder, filename)}`,
          true,
        );

      // Compute unique copy name: "foo.txt" -> "foo (copy).txt", "foo (copy 2).txt", etc.
      const existing = await admin
        .from("files")
        .select("filename")
        .eq("terminal_id", project.id)
        .eq("folder", folder)
        .is("deleted_at", null);
      const taken = new Set<string>(
        ((existing.data ?? []) as { filename: string }[]).map((r) => r.filename),
      );
      const dot = filename.lastIndexOf(".");
      const base = dot > 0 ? filename.slice(0, dot) : filename;
      const ext = dot > 0 ? filename.slice(dot) : "";
      let candidate = `${base} (copy)${ext}`;
      let n = 2;
      while (taken.has(candidate)) {
        candidate = `${base} (copy ${n})${ext}`;
        n++;
      }

      // Build a destination blob key (new file_id, v1)
      const storage = await import("./storage.js");
      const newFileId = crypto.randomUUID();
      const destKey = storage.buildBlobKey({
        projectId: project.id,
        fileId: newFileId,
        version: 1,
      });

      try {
        await storage.copyObject(src.blob_key, destKey);
      } catch (e) {
        return textResult(
          `Copy of underlying blob failed: ${e instanceof Error ? e.message : "unknown"}`,
          true,
        );
      }

      const { data, error } = await admin
        .from("files")
        .insert({
          id: newFileId,
          terminal_id: project.id,
          folder,
          filename: candidate,
          mime_type: src.mime_type,
          size_bytes: src.size_bytes,
          sha256: src.sha256,
          blob_key: destKey,
          uploaded_by: session.userId,
          version: 1,
          virus_scan_status: "clean",
        })
        .select("id, filename")
        .single();

      if (error || !data) {
        // Try to clean up the copied blob to avoid orphans
        try {
          await storage.deleteObject(destKey);
        } catch {
          /* best effort */
        }
        return textResult(
          `Duplicate failed: ${error?.message ?? "unknown"}`,
          true,
        );
      }

      const created = data as { id: string; filename: string };
      await logActivity(session, project, "file.upload", {
        entity_type: "file",
        entity_id: created.id,
        metadata: {
          filename: created.filename,
          folder,
          op: "file.duplicate",
          source_file_id: src.id,
        },
      });
      return textResult(
        `Created ${prettyPath(folder, created.filename)}.`,
      );
    },
  },

  {
    name: "rokki_delete_file",
    description:
      "Move a file to the trash. Soft delete — recoverable from the web Trash until permanently emptied.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        filename: { type: "string" },
        folder: { type: "string", description: "Default '/'." },
      },
      required: ["terminal", "filename"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const folder = normalizePath(String(args.folder ?? "/"));
      const filename = String(args.filename ?? "").trim();
      if (!filename) return textResult("filename is required.", true);

      const { data: row } = await admin
        .from("files")
        .select("id")
        .eq("terminal_id", project.id)
        .eq("folder", folder)
        .eq("filename", filename)
        .is("deleted_at", null)
        .maybeSingle();
      const file = row as { id: string } | null;
      if (!file)
        return textResult(
          `File not found: ${prettyPath(folder, filename)}`,
          true,
        );

      const { error } = await admin
        .from("files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", file.id);
      if (error) return textResult(`Delete failed: ${error.message}`, true);

      await logActivity(session, project, "file.delete", {
        entity_type: "file",
        entity_id: file.id,
        metadata: { filename, folder },
      });
      return textResult(
        `Moved ${prettyPath(folder, filename)} to the trash.`,
      );
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Task mutation                                                             */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_delete_task",
    description: "Delete a task permanently. Identify it by space + seq.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        seq: { type: "integer" },
      },
      required: ["terminal", "seq"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);
      const seq = Number(args.seq);
      if (!Number.isInteger(seq))
        return textResult("seq must be an integer.", true);

      const { data: row } = await admin
        .from("tasks")
        .select("id, title")
        .eq("terminal_id", project.id)
        .eq("ticker_seq", seq)
        .maybeSingle();
      const task = row as { id: string; title: string } | null;
      if (!task) return textResult(`No task #${seq} in ${project.name}.`, true);

      const { error } = await admin.from("tasks").delete().eq("id", task.id);
      if (error) return textResult(`Delete failed: ${error.message}`, true);

      await logActivity(session, project, "task.delete", {
        entity_type: "task",
        entity_id: task.id,
        metadata: { title: task.title, seq },
      });
      return textResult(`Deleted task "${task.title}".`);
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Space create / update                                                     */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_create_terminal",
    description:
      "Create a new space (project / matter / household). If you belong to exactly one organization, it's used automatically; otherwise pass `org`.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name (1–200 chars)." },
        description: { type: "string" },
        ticker: {
          type: "string",
          description: "Optional 2–10 char ticker; auto-generated if omitted.",
        },
        space: { type: "string", description: "Parent space id OR exact name",
        },
        status: {
          type: "string",
          enum: ["planning", "active", "blocked", "done", "archived"],
          description: "Default 'active'.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const name = String(args.name ?? "").trim();
      if (!name || name.length > 200)
        return textResult("name must be 1–200 chars.", true);

      // Resolve the parent space (this is the tenant that owns terminals).
      const { data: myMemberships } = await admin
        .from("space_members")
        .select(
          "space_id, role, spaces!space_members_space_id_fkey(id, slug, name)",
        )
        .eq("user_id", session.userId);
      type MR = {
        space_id: string;
        role: string;
        spaces: { id: string; slug: string; name: string } | null;
      };
      const spaceRows = ((myMemberships ?? []) as unknown as MR[]).filter(
        (r) => r.spaces,
      );
      if (spaceRows.length === 0)
        return textResult(
          "You are not a member of any space. Create one first.",
          true,
        );

      let org: { id: string; slug: string; name: string } | null = null;
      const hint = String(args.space ?? "").trim();
      if (hint) {
        const lower = hint.toLowerCase();
        org =
          spaceRows
            .map((r) => r.spaces!)
            .find(
              (s) =>
                s.id === hint ||
                s.slug.toLowerCase() === lower ||
                s.name.toLowerCase() === lower,
            ) ?? null;
        if (!org)
          return textResult(
            `You are not a member of a space named "${hint}".`,
            true,
          );
      } else if (spaceRows.length === 1) {
        org = spaceRows[0].spaces!;
      } else {
        const names = spaceRows.map((r) => r.spaces!.name).join(", ");
        return textResult(
          `You belong to multiple spaces (${names}). Pass "space" to choose.`,
          true,
        );
      }

      // Only owners/admins of the parent space can create terminals.
      const myRoleRow = spaceRows.find((r) => r.spaces?.id === org.id);
      if (
        !myRoleRow ||
        (myRoleRow.role !== "owner" && myRoleRow.role !== "admin")
      ) {
        return textResult(
          `Only owners and admins of ${org.name} can create terminals here.`,
          true,
        );
      }

      // Ticker
      let ticker = String(args.ticker ?? "").toUpperCase() || null;
      if (ticker && !isValidTicker(ticker))
        return textResult(
          "ticker must be 2–10 uppercase letters/digits starting with a letter.",
          true,
        );
      if (!ticker) {
        const { data: taken } = await admin
          .from("terminals")
          .select("ticker")
          .eq("space_id", org.id);
        const takenSet = ((taken ?? []) as { ticker: string }[]).map((r) => r.ticker);
        ticker = uniqueTicker(suggestTicker(name), takenSet);
      }

      const status =
        (args.status as
          | "planning"
          | "active"
          | "blocked"
          | "done"
          | "archived") ?? "active";
      const description = args.description ? String(args.description) : null;

      const { data, error } = await admin
        .from("terminals")
        .insert({
          space_id: org.id,
          ticker,
          name,
          description,
          type: "space",
          status,
          metadata: {},
          created_by: session.userId,
        })
        .select("id, ticker, name, space_id, status")
        .single();
      if (error || !data) {
        if (error?.code === "23505")
          return textResult(`Ticker ${ticker} is already taken in ${org.name}.`, true);
        return textResult(
          `Could not create terminal: ${error?.message ?? "unknown"}`,
          true,
        );
      }

      const row = data as {
        id: string;
        ticker: string;
        name: string;
        space_id: string;
        status: string;
      };
      await logActivity(
        session,
        {
          id: row.id,
          space_id: row.space_id,
          ticker: row.ticker,
          name: row.name,
          status: row.status,
        },
        "terminal.create",
        {
          entity_type: "terminal",
          entity_id: row.id,
          metadata: { ticker: row.ticker, name: row.name },
        },
      );
      return textResult(
        `Created terminal "${row.name}" (${row.ticker}) in ${org.name}. Status: ${row.status}.`,
      );
    },
  },

  {
    name: "rokki_update_terminal",
    description:
      "Update a space's name, description, or status. Pass only the fields you want to change.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        name: { type: "string" },
        description: { type: ["string", "null"] },
        status: {
          type: "string",
          enum: ["planning", "active", "blocked", "done", "archived"],
        },
      },
      required: ["terminal"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);

      const patch: Record<string, unknown> = {};
      if (typeof args.name === "string" && args.name.trim()) {
        const n = args.name.trim();
        if (n.length > 200)
          return textResult("name must be ≤ 200 chars.", true);
        patch.name = n;
      }
      if (args.description !== undefined) {
        patch.description =
          args.description === null || args.description === ""
            ? null
            : String(args.description);
      }
      if (typeof args.status === "string") patch.status = args.status;
      if (Object.keys(patch).length === 0)
        return textResult("Nothing to update.", true);

      const { data, error } = await admin
        .from("terminals")
        // @ts-expect-error — generic update payload collapses to never
        .update(patch)
        .eq("id", project.id)
        .select("name, status, description")
        .single();
      if (error || !data)
        return textResult(
          `Update failed: ${error?.message ?? "unknown"}`,
          true,
        );
      const row = data as {
        name: string;
        status: string;
        description: string | null;
      };
      await logActivity(session, project, "terminal.update", {
        entity_type: "project",
        entity_id: project.id,
        metadata: patch,
      });
      return textResult(
        `Updated ${row.name} — status: ${row.status}${row.description ? `\n${row.description}` : ""}`,
      );
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Activity feed                                                              */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_recent_activity",
    description:
      "Show the most recent activity across your spaces, or scoped to one space. Useful for 'what happened today?' queries.",
    inputSchema: {
      type: "object",
      properties: {
        space: {
          type: "string",
          description: "Optional: scope to one space by ticker or name.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Default 20.",
        },
      },
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const all = await loadAccessibleProjects(session);
      if (all.length === 0) return textResult("You have no spaces yet.");

      let projects = all;
      if (args.terminal) {
        const scoped = await resolveProject(session, String(args.terminal));
        if (!scoped) return textResult("Space not found.", true);
        projects = [scoped];
      }
      const byId = new Map(projects.map((p) => [p.id, p]));
      const ids = projects.map((p) => p.id);
      const limit = Math.min(100, Math.max(1, Number(args.limit ?? 20)));

      // Collect org IDs so we can include org-level activity (e.g. tool
      // invocations, which aren't scoped to a project).
      const orgIds = Array.from(new Set(projects.map((p) => p.space_id)));
      const scopeFilter =
        args.terminal
          ? // When scoped to one space, include only that project's rows.
            `terminal_id.in.(${ids.join(",")})`
          : // Otherwise include project rows OR org rows for any of my orgs.
            `terminal_id.in.(${ids.join(",")}),and(terminal_id.is.null,space_id.in.(${orgIds.join(",")}))`;

      const { data } = await admin
        .from("activity")
        .select(
          "action, actor_id, terminal_id, space_id, entity_type, metadata, created_at",
        )
        .or(scopeFilter)
        .order("created_at", { ascending: false })
        .limit(limit);

      type Row = {
        action: string;
        actor_id: string | null;
        terminal_id: string | null;
        space_id: string | null;
        entity_type: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      };
      const rows = (data ?? []) as Row[];
      if (rows.length === 0)
        return textResult(
          `No activity yet in ${projects.length === 1 ? projects[0].name : "your spaces"}.`,
        );

      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)),
      );
      const { data: profiles } = actorIds.length
        ? await admin
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", actorIds)
        : { data: [] };
      type P = { user_id: string; full_name: string | null };
      const nameById = new Map(
        ((profiles ?? []) as P[]).map((p) => [p.user_id, p.full_name ?? "someone"]),
      );

      const lines = rows.map((r) => {
        const when = new Date(r.created_at).toLocaleString();
        const who = r.actor_id ? (nameById.get(r.actor_id) ?? "someone") : "system";
        const p = r.terminal_id ? byId.get(r.terminal_id) : undefined;
        const where = p ? ` · ${p.name}` : "";
        const what = describeAction(r.action, r.metadata);
        return `${when} · ${who}${where}: ${what}`;
      });
      return textResult(lines.join("\n"));
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Retrieval — ask / search                                                  */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_ask_project",
    description:
      "Ask a question about a space's files. Returns the top relevant chunks with filename + page citations so the LLM can synthesize an answer. Uses vector similarity when OpenAI embeddings are configured, otherwise Postgres full-text search.",
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        question: { type: "string", description: "Natural-language question." },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Max chunks to return (default 6).",
        },
      },
      required: ["terminal", "question"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);
      const question = String(args.question ?? "").trim();
      if (!question) return textResult("question is required.", true);
      const limit = Math.min(20, Math.max(1, Number(args.limit ?? 6)));

      const { embedQuery, vectorLiteral, embeddingsEnabled } = await import(
        "./embedder.js"
      );

      type Hit = {
        file_id: string;
        chunk_index: number;
        content: string;
        page_number: number | null;
        score: number;
      };
      let hits: Hit[] = [];
      let mode: "hybrid" | "fts" = "fts";

      // Hybrid path: embed the query, hand vector + FTS to the RRF RPC.
      // If embeddings are off, we pass NULL and the RPC degrades to FTS.
      let qvec: number[] | null = null;
      if (embeddingsEnabled()) {
        qvec = await embedQuery(question);
      }
      const { data: rrfData, error: rrfErr } = await admin.rpc(
        "search_chunks_hybrid",
        {
          _query: question,
          _query_embedding: qvec ? vectorLiteral(qvec) : undefined,
          _terminal: project.id,
          _limit: limit,
        },
      );
      if (!rrfErr) {
        type Row = {
          file_id: string;
          chunk_index: number;
          content: string;
          page_number: number | null;
          score: number;
          vector_rank: number | null;
          fts_rank: number | null;
        };
        hits = ((rrfData ?? []) as Row[]).map((r) => ({
          file_id: r.file_id,
          chunk_index: r.chunk_index,
          content: r.content,
          page_number: r.page_number,
          score: r.score,
        }));
        mode = qvec && hits.some(() => true) ? "hybrid" : "fts";
      } else {
        console.error("[mcp] hybrid rpc error:", rrfErr.message);
      }

      if (hits.length === 0) {
        // Safety net: if hybrid returned nothing (e.g. the embedding was
        // null AND FTS didn't match), fall back to the plain FTS RPC.
        const { data, error } = await admin.rpc("search_chunks_fts", {
          _query: question,
          _project: project.id,
          _limit: limit,
        });
        if (error) {
          return textResult(`Search failed: ${error.message}`, true);
        }
        type Row = {
          file_id: string;
          chunk_index: number;
          content: string;
          page_number: number | null;
          rank: number;
        };
        hits = ((data ?? []) as Row[]).map((r) => ({
          file_id: r.file_id,
          chunk_index: r.chunk_index,
          content: r.content,
          page_number: r.page_number,
          score: r.rank,
        }));
      }

      if (hits.length === 0) {
        // Any indexed content at all?
        const { count } = await admin
          .from("file_chunks")
          .select("id", { count: "exact", head: true })
          .eq("terminal_id", project.id);
        if (!count)
          return textResult(
            `No indexed files in ${project.name} yet. Upload a file and wait a few seconds for the indexer to process it.`,
          );
        return textResult(
          `No relevant content found in ${project.name} for: "${question}"`,
        );
      }

      // Fetch file metadata for citations.
      const fileIds = Array.from(new Set(hits.map((h) => h.file_id)));
      const { data: filesData } = await admin
        .from("files")
        .select("id, filename, folder")
        .in("id", fileIds);
      type F = { id: string; filename: string; folder: string };
      const byId = new Map(((filesData ?? []) as F[]).map((f) => [f.id, f]));

      const header = `${project.name} — top ${hits.length} result${hits.length === 1 ? "" : "s"} for "${question}" (via ${mode === "hybrid" ? "hybrid vector + FTS (RRF)" : "FTS"})\n`;
      const lines = hits.map((h, i) => {
        const f = byId.get(h.file_id);
        const where = f
          ? `${f.folder === "/" ? "" : f.folder + "/"}${f.filename}${
              h.page_number ? ` · p.${h.page_number}` : ""
            }`
          : h.file_id.slice(0, 8);
        const body = h.content.length > 900 ? h.content.slice(0, 900) + "…" : h.content;
        return `[${i + 1}] ${where}\n${body}`;
      });
      return textResult(header + "\n" + lines.join("\n\n"));
    },
  },

  {
    name: "rokki_search",
    description:
      "Keyword search across your indexed files and task titles. Pass `space` to scope, or leave it out to search everything you can access.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        space: {
          type: "string",
          description: "Optional: scope to one space by ticker or name.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Default 10.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const query = String(args.query ?? "").trim();
      if (!query) return textResult("query is required.", true);
      const limit = Math.min(20, Math.max(1, Number(args.limit ?? 10)));

      const all = await loadAccessibleProjects(session);
      if (all.length === 0) return textResult("You have no spaces.");
      let scoped = all;
      if (args.terminal) {
        const p = await resolveProject(session, String(args.terminal));
        if (!p) return textResult("Space not found.", true);
        scoped = [p];
      }
      const byId = new Map(scoped.map((p) => [p.id, p]));
      const projectIds = scoped.map((p) => p.id);

      // Files: use the FTS RPC, but only one project at a time since the
      // RPC takes a single terminal_id. For cross-project search, we do a
      // simple server-side merge (projectIds tends to be small).
      type ChunkHit = {
        terminal_id: string;
        file_id: string;
        content: string;
        page_number: number | null;
        rank: number;
      };
      const chunkResults: ChunkHit[] = [];
      for (const pid of projectIds) {
        const { data } = await admin.rpc("search_chunks_fts", {
          _query: query,
          _project: pid,
          _limit: limit,
        });
        type Row = {
          file_id: string;
          terminal_id: string;
          content: string;
          page_number: number | null;
          rank: number;
        };
        for (const r of (data ?? []) as Row[])
          chunkResults.push({
            terminal_id: r.terminal_id,
            file_id: r.file_id,
            content: r.content,
            page_number: r.page_number,
            rank: r.rank,
          });
      }
      chunkResults.sort((a, b) => b.rank - a.rank);
      const topChunks = chunkResults.slice(0, limit);

      const fileIds = Array.from(new Set(topChunks.map((c) => c.file_id)));
      const { data: files } = fileIds.length
        ? await admin
            .from("files")
            .select("id, filename, folder")
            .in("id", fileIds)
        : { data: [] };
      type F = { id: string; filename: string; folder: string };
      const fileById = new Map(((files ?? []) as F[]).map((f) => [f.id, f]));

      // Task search: simple ILIKE on title since we don't have an FTS column yet.
      const { data: taskRows } = await admin
        .from("tasks")
        .select("ticker_seq, title, status, terminal_id")
        .in("terminal_id", projectIds)
        .ilike("title", `%${query.replace(/[%_]/g, "\\$&")}%`)
        .limit(limit);
      type T = {
        ticker_seq: number;
        title: string;
        status: string;
        terminal_id: string;
      };
      const tasks = (taskRows ?? []) as T[];

      const out: string[] = [];
      if (topChunks.length) {
        out.push(`── Files (${topChunks.length}) ──`);
        for (const h of topChunks) {
          const f = fileById.get(h.file_id);
          const proj = byId.get(h.terminal_id);
          const loc = f
            ? `${f.folder === "/" ? "" : f.folder + "/"}${f.filename}${
                h.page_number ? ` · p.${h.page_number}` : ""
              }`
            : h.file_id.slice(0, 8);
          const snippet = snippetAround(h.content, query, 180);
          out.push(`• [${proj?.ticker ?? "?"}] ${loc}\n  ${snippet}`);
        }
      }
      if (tasks.length) {
        if (out.length) out.push("");
        out.push(`── Tasks (${tasks.length}) ──`);
        for (const t of tasks) {
          const proj = byId.get(t.terminal_id);
          out.push(
            `• [${proj?.ticker ?? "?"}] #${t.ticker_seq} ${t.title} [${t.status}]`,
          );
        }
      }
      if (out.length === 0)
        return textResult(`No results for "${query}".`);
      return textResult(out.join("\n"));
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Tool marketplace                                                          */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_register_tool",
    description:
      "Register a new custom tool that Claude (or anyone with access) can invoke via rokki_call_tool. Body is JS/TS that defines a function named `run`, `main`, or `handler` taking an `input` object and returning the result. Tools run in a sandboxed worker thread with fetch available.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable name (1–120 chars).",
        },
        slug: {
          type: "string",
          description:
            "URL-safe slug (lowercase alnum + dashes, 3–62 chars). Must be unique to your account. Auto-derived from name if omitted.",
        },
        description: {
          type: "string",
          description:
            "10–2000 char description of what the tool does, when to use it, and what each input field means.",
        },
        input_schema: {
          type: "object",
          description:
            "JSON Schema for the tool's input object. Claude will validate against this.",
        },
        output_schema: {
          type: "object",
          description: "Optional JSON Schema for the tool's return value.",
        },
        code: {
          type: "string",
          description:
            "JavaScript source. Must define `run`, `main`, or `handler`. Example: `async function run({ city }) { const r = await fetch(...); return { temp: ... } }`",
        },
        timeout_seconds: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Per-invocation timeout. Default 10s, max 30s.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional searchable tags.",
        },
      },
      required: ["name", "description", "input_schema", "code"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const name = String(args.name ?? "").trim();
      const description = String(args.description ?? "").trim();
      const code = String(args.code ?? "");
      if (name.length < 1 || name.length > 120)
        return textResult("name must be 1–120 chars.", true);
      if (description.length < 10 || description.length > 2000)
        return textResult("description must be 10–2000 chars.", true);
      if (!code.trim()) return textResult("code is required.", true);

      const slugRaw =
        typeof args.slug === "string" && args.slug.trim()
          ? args.slug.trim().toLowerCase()
          : name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
      if (!/^[a-z][a-z0-9-]{1,60}[a-z0-9]$/.test(slugRaw))
        return textResult(
          "slug must be lowercase letters/digits/dashes, 3–62 chars, start with a letter.",
          true,
        );

      // Pick the user's default space (same rules as rokki_create_space).
      const { data: myMemberships } = await admin
        .from("space_members")
        .select("space_id, spaces!space_members_space_id_fkey(id, name)")
        .eq("user_id", session.userId);
      type MR = {
        space_id: string;
        spaces: { id: string; name: string } | null;
      };
      const orgs = ((myMemberships ?? []) as unknown as MR[])
        .map((r) => r.spaces!)
        .filter(Boolean);
      if (orgs.length === 0)
        return textResult(
          "You are not a member of any space. Create one first.",
          true,
        );
      const org = orgs[0];

      const inputSchema = (args.input_schema ?? {
        type: "object",
      }) as Record<string, unknown>;
      const outputSchema = (args.output_schema ?? null) as
        | Record<string, unknown>
        | null;
      const timeoutSec =
        typeof args.timeout_seconds === "number"
          ? Math.min(30, Math.max(1, args.timeout_seconds))
          : 10;
      const tags = Array.isArray(args.tags)
        ? (args.tags as unknown[]).filter((t): t is string => typeof t === "string")
        : [];

      // 1. Insert tools row (current_version defaults to "0.0.0").
      // Generated Database types make `.insert` payloads collapse to never;
      // cast the typed client to a looser shape so we can pass literals.
      const tools = admin.from("tools") as unknown as {
        insert: (row: Record<string, unknown>) => {
          select: (cols: string) => {
            single: () => Promise<{
              data: {
                id: string;
                slug: string;
                name: string;
                current_version: string;
              } | null;
              error: { code?: string; message: string } | null;
            }>;
          };
        };
      };
      const toolInsert = await tools
        .insert({
          slug: slugRaw,
          owner_space_id: org.id,
          owner_user_id: session.userId,
          name,
          description,
          input_schema: inputSchema,
          output_schema: outputSchema,
          visibility: "private",
          approval_mode: "auto",
          timeout_seconds: timeoutSec,
          memory_mb: 256,
          requires_providers: [],
          tags,
        })
        .select("id, slug, name, current_version")
        .single();
      if (toolInsert.error || !toolInsert.data) {
        if (toolInsert.error?.code === "23505")
          return textResult(
            `Slug "${slugRaw}" already taken — pick another.`,
            true,
          );
        return textResult(
          `Could not register tool: ${toolInsert.error?.message ?? "unknown"}`,
          true,
        );
      }
      const tool = toolInsert.data as {
        id: string;
        slug: string;
        name: string;
        current_version: string;
      };

      // 2. Insert tool_versions row.
      const versionInsert = await admin
        .from("tool_versions")
        .insert({
          tool_id: tool.id,
          version: "1.0.0",
          runtime: "node20",
          entrypoint: "index.js",
          scripts: { "index.js": code },
          skill_md: `# ${name}\n\n${description}`,
          published: true,
          published_at: new Date().toISOString(),
          published_by: session.userId,
        })
        .select("id, version")
        .single();
      if (versionInsert.error || !versionInsert.data) {
        await admin.from("tools").delete().eq("id", tool.id);
        return textResult(
          `Could not publish tool version: ${versionInsert.error?.message ?? "unknown"}`,
          true,
        );
      }

      // 3. Mark tools.current_version.
      await admin
        .from("tools")
        .update({ current_version: "1.0.0" })
        .eq("id", tool.id);

      return textResult(
        `Registered "${name}" (slug: ${tool.slug}, v1.0.0). Call it with rokki_call_tool({ slug: "${tool.slug}", input: … }).`,
      );
    },
  },

  {
    name: "rokki_list_tools",
    description:
      "List tools you can invoke — your own, tools your org has published, and anything public.",
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Optional substring match on name/slug/description.",
        },
      },
      additionalProperties: false,
    },
    handler: async (args, session) => {
      // Your orgs
      const { data: myOrgs } = await admin
        .from("space_members")
        .select("space_id")
        .eq("user_id", session.userId);
      const orgIds = ((myOrgs ?? []) as { space_id: string }[]).map(
        (r) => r.space_id,
      );

      let query = admin
        .from("tools")
        .select(
          "id, slug, name, description, visibility, owner_user_id, owner_space_id, current_version, tags",
        )
        .is("deleted_at", null);
      // Visibility scope: mine OR public OR (org and I'm in the org).
      const orFilter = [
        `owner_user_id.eq.${session.userId}`,
        "visibility.eq.public",
        orgIds.length
          ? `and(visibility.eq.org,owner_space_id.in.(${orgIds.join(",")}))`
          : null,
      ]
        .filter(Boolean)
        .join(",");
      query = query.or(orFilter);

      const search = typeof args.search === "string" ? args.search.trim() : "";
      if (search) {
        const esc = search.replace(/[%_]/g, "\\$&");
        query = query.or(
          `name.ilike.%${esc}%,slug.ilike.%${esc}%,description.ilike.%${esc}%`,
        );
      }

      const { data } = await query.order("name", { ascending: true });
      type Row = {
        slug: string;
        name: string;
        description: string;
        visibility: string;
        current_version: string;
        tags: string[] | null;
      };
      const rows = (data ?? []) as Row[];
      if (rows.length === 0)
        return textResult(
          search
            ? `No tools match "${search}".`
            : "You haven't registered any tools yet. Try rokki_register_tool.",
        );

      const lines = rows.map((r) => {
        const short =
          r.description.length > 120
            ? r.description.slice(0, 120) + "…"
            : r.description;
        const visIcon =
          r.visibility === "public"
            ? "🌍"
            : r.visibility === "org"
              ? "🏢"
              : "🔒";
        return `${visIcon} ${r.slug} v${r.current_version} — ${r.name}\n   ${short}`;
      });
      return textResult(`${rows.length} tool${rows.length === 1 ? "" : "s"}:\n${lines.join("\n")}`);
    },
  },

  {
    name: "rokki_call_tool",
    description:
      "Invoke a registered tool by slug. The tool's code runs in a sandboxed worker and the return value is relayed back. Use rokki_list_tools to see available slugs.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        input: {
          description: "Object passed to the tool's run(input) function.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const slug = String(args.slug ?? "").trim().toLowerCase();
      if (!slug) return textResult("slug is required.", true);

      // Look up tool — the same visibility filter as rokki_list_tools.
      const { data: myOrgs } = await admin
        .from("space_members")
        .select("space_id")
        .eq("user_id", session.userId);
      const orgIds = ((myOrgs ?? []) as { space_id: string }[]).map(
        (r) => r.space_id,
      );
      const orFilter = [
        `owner_user_id.eq.${session.userId}`,
        "visibility.eq.public",
        orgIds.length
          ? `and(visibility.eq.org,owner_space_id.in.(${orgIds.join(",")}))`
          : null,
      ]
        .filter(Boolean)
        .join(",");
      const toolLookup = await admin
        .from("tools")
        .select(
          "id, slug, name, current_version, timeout_seconds, owner_space_id, visibility",
        )
        .is("deleted_at", null)
        .or(orFilter)
        .eq("slug", slug)
        .maybeSingle();
      const tool = toolLookup.data as
        | {
            id: string;
            slug: string;
            name: string;
            current_version: string;
            timeout_seconds: number;
            owner_space_id: string;
            visibility: string;
          }
        | null;
      if (!tool)
        return textResult(
          `Tool "${slug}" not found or you don't have access.`,
          true,
        );

      // Load the current version.
      const versionLookup = await admin
        .from("tool_versions")
        .select("id, entrypoint, runtime, scripts")
        .eq("tool_id", tool.id)
        .eq("version", tool.current_version)
        .eq("published", true)
        .maybeSingle();
      const version = versionLookup.data as
        | {
            id: string;
            entrypoint: string;
            runtime: string;
            scripts: Record<string, string>;
          }
        | null;
      if (!version)
        return textResult(
          `Tool "${slug}" has no published version.`,
          true,
        );

      // Create the invocation row (status=queued → running).
      const invokeStart = Date.now();
      const inputJson = JSON.stringify(args.input ?? {});
      const inputsSha = crypto
        .createHash("sha256")
        .update(inputJson)
        .digest("hex");
      const invocationInsert = await admin
        .from("tool_invocations")
        .insert({
          tool_id: tool.id,
          tool_version_id: version.id,
          user_id: session.userId,
          token_id: session.tokenId,
          status: "running",
          started_at: new Date().toISOString(),
          inputs_sha256: inputsSha,
        })
        .select("id")
        .single();
      const invocationId =
        (invocationInsert.data as { id: string } | null)?.id ??
        crypto.randomUUID();

      // Call the executor.
      const { invokeTool } = await import("./executor.js");
      const res = await invokeTool({
        invocation_id: invocationId,
        runtime: version.runtime,
        entrypoint: version.entrypoint,
        scripts: version.scripts,
        input: args.input ?? {},
        timeout_seconds: tool.timeout_seconds,
      });
      const duration = Date.now() - invokeStart;

      // Persist the result. The actual payload lives only in the MCP
      // response for now — when we move to background queues, we'll stash
      // output in object storage and reference it by hash.
      const outputJson = JSON.stringify(res.output ?? null);
      const outputSha =
        outputJson && outputJson !== "null"
          ? crypto.createHash("sha256").update(outputJson).digest("hex")
          : null;
      await admin
        .from("tool_invocations")
        .update({
          status:
            res.status === "success"
              ? "success"
              : res.status === "timeout"
                ? "timeout"
                : "error",
          completed_at: new Date().toISOString(),
          duration_ms: res.duration_ms || duration,
          output_sha256: outputSha,
          output_size_bytes: outputJson
            ? Buffer.byteLength(outputJson, "utf8")
            : null,
          error_code: res.error_code ?? null,
          error_message: res.error_message ?? null,
        })
        .eq("id", invocationId);

      // Activity log.
      await admin.from("activity").insert({
        terminal_id: null,
        space_id: tool.owner_space_id,
        actor_id: session.userId,
        actor_token_id: session.tokenId,
        actor_tool_id: tool.id,
        action: "tool.invoke",
        entity_type: "tool",
        entity_id: tool.id,
        metadata: {
          slug: tool.slug,
          status: res.status,
          duration_ms: res.duration_ms || duration,
          via: "mcp",
        },
      });

      if (res.status === "success") {
        const body = JSON.stringify(res.output, null, 2);
        const logs = res.logs.length
          ? `\n─ logs ─\n${res.logs.join("\n")}`
          : "";
        return textResult(
          `Result from ${tool.slug} (${res.duration_ms}ms):\n${body}${logs}`,
        );
      }
      if (res.status === "timeout") {
        return textResult(
          `Tool ${tool.slug} exceeded its ${tool.timeout_seconds}s timeout.`,
          true,
        );
      }
      return textResult(
        `Tool ${tool.slug} failed: ${res.error_message ?? res.error_code ?? "unknown"}${res.logs.length ? "\n─ logs ─\n" + res.logs.join("\n") : ""}`,
        true,
      );
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Comments                                                                  */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_comment",
    description:
      "Post a comment on a task in a space. Use rokki_list_tasks first to find the task, then pass its seq.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        task_seq: {
          type: "integer",
          description:
            "Task ticker_seq inside the space. Use rokki_list_tasks to find it.",
        },
        body: {
          type: "string",
          description: "Comment text (1–20000 chars). Plain text.",
        },
      },
      required: ["terminal", "task_seq", "body"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);
      const seq = Number(args.task_seq);
      if (!Number.isInteger(seq))
        return textResult("task_seq must be an integer.", true);
      const text = String(args.body ?? "").trim();
      if (text.length < 1 || text.length > 20_000)
        return textResult("body must be 1–20,000 chars.", true);

      const { data: task } = await admin
        .from("tasks")
        .select("id, title")
        .eq("terminal_id", project.id)
        .eq("ticker_seq", seq)
        .maybeSingle();
      if (!task)
        return textResult(`No task #${seq} in ${project.name}.`, true);
      const t = task as { id: string; title: string };

      const { error } = await admin.from("comments").insert({
        entity_type: "task",
        entity_id: t.id,
        terminal_id: project.id,
        parent_id: null,
        body: text,
        mentions: [],
        created_by: session.userId,
      });
      if (error)
        return textResult(`Comment failed: ${error.message}`, true);
      return textResult(`Commented on "${t.title}".`);
    },
  },

  {
    name: "rokki_list_comments",
    description: "List comments on a task (oldest first).",
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        task_seq: { type: "integer" },
      },
      required: ["terminal", "task_seq"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Space not found.", true);
      const seq = Number(args.task_seq);

      const { data: task } = await admin
        .from("tasks")
        .select("id, title")
        .eq("terminal_id", project.id)
        .eq("ticker_seq", seq)
        .maybeSingle();
      if (!task) return textResult(`No task #${seq}.`, true);
      const t = task as { id: string; title: string };

      const { data } = await admin
        .from("comments")
        .select("body, created_at, created_by")
        .eq("entity_type", "task")
        .eq("entity_id", t.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      type Row = {
        body: string;
        created_at: string;
        created_by: string;
      };
      const rows = (data ?? []) as Row[];
      if (rows.length === 0)
        return textResult(`No comments on "${t.title}" yet.`);

      const authorIds = Array.from(new Set(rows.map((r) => r.created_by)));
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", authorIds);
      type P = { user_id: string; full_name: string | null };
      const nameById = new Map(
        ((profiles ?? []) as P[]).map((p) => [
          p.user_id,
          p.full_name ?? "someone",
        ]),
      );
      const lines = rows.map((r) => {
        const who = nameById.get(r.created_by) ?? "someone";
        const when = new Date(r.created_at).toLocaleString();
        return `• ${who} · ${when}\n  ${r.body.replace(/\n/g, "\n  ")}`;
      });
      return textResult(
        `"${t.title}" — ${rows.length} comment${rows.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
      );
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Notifications                                                             */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_notifications",
    description:
      "Your notifications feed. Mentions, replies, invites, etc. Pass unread_only=true to filter.",
    inputSchema: {
      type: "object",
      properties: {
        unread_only: { type: "boolean" },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Default 20.",
        },
      },
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const limit = Math.min(100, Math.max(1, Number(args.limit ?? 20)));
      let q = admin
        .from("notifications")
        .select("id, kind, title, body, read_at, created_at, url")
        .eq("user_id", session.userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (args.unread_only) q = q.is("read_at", null);
      const { data } = await q;
      type Row = {
        id: string;
        kind: string;
        title: string;
        body: string | null;
        read_at: string | null;
        created_at: string;
        url: string | null;
      };
      const rows = (data ?? []) as Row[];
      if (rows.length === 0)
        return textResult(
          args.unread_only ? "No unread notifications." : "No notifications.",
        );
      const lines = rows.map((r) => {
        const mark = r.read_at ? " " : "●";
        const when = new Date(r.created_at).toLocaleString();
        return `${mark} ${when} · ${r.title}${r.body ? `\n    ${r.body}` : ""}${r.url ? `\n    ${r.url}` : ""}`;
      });
      return textResult(lines.join("\n"));
    },
  },

  {
    name: "rokki_mark_notifications_read",
    description: "Mark notifications as read — pass all=true or ids=[…].",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean" },
        ids: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    handler: async (args, session) => {
      if (args.all) {
        const { error } = await admin
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", session.userId)
          .is("read_at", null);
        if (error)
          return textResult(`Failed: ${error.message}`, true);
        return textResult("All notifications marked read.");
      }
      const ids = Array.isArray(args.ids)
        ? (args.ids as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [];
      if (ids.length === 0)
        return textResult("Pass all=true or ids=[…].", true);
      const { error } = await admin
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", session.userId)
        .in("id", ids);
      if (error) return textResult(`Failed: ${error.message}`, true);
      return textResult(`Marked ${ids.length} notification(s) read.`);
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Spaces (tenants: companies, families, households)                         */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_list_spaces",
    description:
      "List the spaces you belong to. A space is a tenant — a company, family, or household — that contains terminals and people.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (_args, session) => {
      const { data } = await admin
        .from("space_members")
        .select("role, spaces!space_members_space_id_fkey(id, slug, name)")
        .eq("user_id", session.userId);
      type Row = {
        role: string;
        spaces: { id: string; slug: string; name: string } | null;
      };
      const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.spaces);
      if (rows.length === 0)
        return textResult(
          "You don't belong to any spaces yet. Ask a platform admin to add you.",
        );
      const lines = rows.map(
        (r) => `• ${r.spaces!.name} (${r.spaces!.slug}) — ${r.role}`,
      );
      return textResult(
        `${rows.length} space${rows.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
      );
    },
  },

  {
    name: "rokki_create_space",
    description:
      "Create a new space (tenant). Restricted to platform administrators. The caller becomes the space owner automatically.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "URL-safe slug, 3–40 chars, lowercase letters/digits/hyphens, starts with letter.",
        },
        name: {
          type: "string",
          description: "Human-readable name (1–120 chars).",
        },
      },
      required: ["slug", "name"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      // Platform admin check.
      const { data: profile } = await admin
        .from("profiles")
        .select("is_platform_admin")
        .eq("user_id", session.userId)
        .maybeSingle();
      if (
        !(profile as { is_platform_admin?: boolean } | null)?.is_platform_admin
      ) {
        return textResult(
          "Only platform administrators can create spaces.",
          true,
        );
      }

      const slug = String(args.slug ?? "").trim().toLowerCase();
      const name = String(args.name ?? "").trim();
      if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug))
        return textResult(
          "slug must be 3–40 chars, lowercase letters/digits/hyphens, start with a letter.",
          true,
        );
      if (name.length < 1 || name.length > 120)
        return textResult("name must be 1–120 chars.", true);

      const { data, error } = await admin
        .from("spaces")
        .insert({ slug, name, created_by: session.userId })
        .select("id, slug, name")
        .single();
      if (error || !data) {
        if (error?.code === "23505")
          return textResult(`Slug "${slug}" is taken.`, true);
        return textResult(
          `Could not create space: ${error?.message ?? "unknown"}`,
          true,
        );
      }
      const row = data as { id: string; slug: string; name: string };
      return textResult(
        `Created space "${row.name}" (${row.slug}). You are the owner — invite people with rokki_invite_to_space.`,
      );
    },
  },

  {
    name: "rokki_list_space_members",
    description:
      "List everyone in a space (tenant) with their role. Pass the space's slug or name.",
    inputSchema: {
      type: "object",
      properties: {
        space: {
          type: "string",
          description: "Space slug (e.g. 'helios') or exact name.",
        },
      },
      required: ["space"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const hint = String(args.space ?? "").trim();
      if (!hint) return textResult("space is required.", true);
      const spaceRow = await resolveSpaceByHint(session.userId, hint);
      if (!spaceRow)
        return textResult(`Space "${hint}" not found or not accessible.`, true);

      const { data: members } = await admin
        .from("space_members")
        .select("user_id, role, joined_at")
        .eq("space_id", spaceRow.id)
        .order("joined_at", { ascending: true });
      type M = { user_id: string; role: string };
      const rows = (members ?? []) as M[];
      const ids = rows.map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await admin
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", ids)
        : { data: [] };
      type P = { user_id: string; full_name: string | null };
      const nameById = new Map(
        ((profiles ?? []) as P[]).map((p) => [p.user_id, p.full_name ?? "someone"]),
      );
      const lines = rows.map(
        (m) => `• ${nameById.get(m.user_id) ?? m.user_id} — ${m.role}`,
      );
      return textResult(
        `${spaceRow.name} — ${rows.length} member${rows.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
      );
    },
  },

  {
    name: "rokki_invite_to_space",
    description:
      "Invite someone to a space (the company/family/etc.) by email. Only space owners and admins can invite. They'll get a magic-link email that auto-accepts.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        space: { type: "string", description: "Space slug or exact name." },
        email: { type: "string" },
        role: {
          type: "string",
          enum: ["owner", "admin", "member"],
          description: "Default: member.",
        },
      },
      required: ["space", "email"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const hint = String(args.space ?? "").trim();
      const space = await resolveSpaceByHint(session.userId, hint);
      if (!space) return textResult(`Space "${hint}" not found.`, true);

      // Must be owner/admin of that space.
      const { data: me } = await admin
        .from("space_members")
        .select("role")
        .eq("space_id", space.id)
        .eq("user_id", session.userId)
        .maybeSingle();
      const myRole = (me as { role: string } | null)?.role;
      if (!myRole || !["owner", "admin"].includes(myRole)) {
        return textResult(
          "Only space owners and admins can invite.",
          true,
        );
      }

      const email = String(args.email ?? "")
        .trim()
        .toLowerCase();
      if (!email || !/^\S+@\S+\.\S+$/.test(email))
        return textResult("Valid email is required.", true);
      const role = (args.role as "owner" | "admin" | "member") ?? "member";

      // Already a member?
      const { data: existingUsers } = await admin.auth.admin.listUsers();
      const existing = existingUsers?.users.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (existing) {
        const { data: alreadyIn } = await admin
          .from("space_members")
          .select("user_id")
          .eq("space_id", space.id)
          .eq("user_id", existing.id)
          .maybeSingle();
        if (alreadyIn)
          return textResult(`${email} is already in ${space.name}.`);
        await admin.from("space_members").insert({
          space_id: space.id,
          user_id: existing.id,
          role,
        });
        return textResult(`Added ${email} to ${space.name} as ${role}.`);
      }

      // Create pending invite + send magic link.
      const { default: crypto } = await import("node:crypto");
      const token = crypto.randomBytes(32).toString("base64url");
      await admin.from("invites").insert({
        email,
        space_id: space.id,
        terminal_id: null,
        role,
        token,
        invited_by: session.userId,
      });
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${appUrl}/auth/callback?redirect_to=${encodeURIComponent(
            "/",
          )}`,
        },
      );
      if (sendErr && sendErr.status !== 422) {
        return textResult(
          `Invite row created but email send failed: ${sendErr.message}`,
          true,
        );
      }
      return textResult(
        `Invited ${email} to ${space.name} as ${role}.`,
      );
    },
  },

  /* ----------------------------------------------------------------------- */
  /* Generative quick actions                                                  */
  /*                                                                           */
  /* Every tool in this section returns a structured text payload suitable    */
  /* for the calling LLM to synthesize into prose — Rokki itself doesn't      */
  /* spend model tokens. The tool names deliberately imply "the caller will   */
  /* draft/summarize" so MCP hosts like Claude Desktop frame the response    */
  /* correctly.                                                                */
  /* ----------------------------------------------------------------------- */

  {
    name: "rokki_summarize_terminal",
    description:
      "Gather raw material the LLM can turn into a plain-English summary of a terminal: open tasks, recent activity, recent files, pending invites. Returns a structured text block; synthesis is the caller's job.",
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string", description: "Terminal ticker or name." },
        days: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Activity lookback window. Default 7.",
        },
      },
      required: ["terminal"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Terminal not found.", true);
      const days = Math.min(30, Math.max(1, Number(args.days ?? 7)));
      const since = new Date(Date.now() - days * 86_400_000).toISOString();

      const [openTasks, recentActivity, recentFiles, pendingInvites] =
        await Promise.all([
          admin
            .from("tasks")
            .select("ticker_seq, title, status, priority, due_date")
            .eq("terminal_id", project.id)
            .neq("status", "done")
            .order("priority", { ascending: true })
            .limit(20),
          admin
            .from("activity")
            .select("action, metadata, created_at")
            .eq("terminal_id", project.id)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(50),
          admin
            .from("files")
            .select("filename, folder, uploaded_at")
            .eq("terminal_id", project.id)
            .is("deleted_at", null)
            .gte("uploaded_at", since)
            .order("uploaded_at", { ascending: false })
            .limit(10),
          admin
            .from("invites")
            .select("email, role")
            .eq("terminal_id", project.id)
            .is("accepted_at", null)
            .gt("expires_at", new Date().toISOString()),
        ]);

      const lines: string[] = [];
      lines.push(`# ${project.name} (${project.ticker})`);
      lines.push(`Status: ${project.status}`);
      lines.push(`Window: last ${days} day${days === 1 ? "" : "s"}`);
      lines.push("");

      type Task = {
        ticker_seq: number;
        title: string;
        status: string;
        priority: number;
        due_date: string | null;
      };
      const tasks = (openTasks.data ?? []) as Task[];
      lines.push(`## Open tasks (${tasks.length})`);
      if (tasks.length === 0) lines.push("  (none)");
      for (const t of tasks.slice(0, 12)) {
        const due = t.due_date ? ` · due ${t.due_date}` : "";
        const prio = "!".repeat(5 - t.priority);
        lines.push(
          `  - #${t.ticker_seq} ${prio} ${t.title} [${t.status}]${due}`,
        );
      }
      lines.push("");

      type Act = {
        action: string;
        metadata: Record<string, unknown> | null;
        created_at: string;
      };
      const acts = (recentActivity.data ?? []) as Act[];
      lines.push(`## Recent activity (${acts.length})`);
      if (acts.length === 0) lines.push("  (quiet)");
      const bucket: Record<string, number> = {};
      for (const a of acts) bucket[a.action] = (bucket[a.action] ?? 0) + 1;
      for (const [k, v] of Object.entries(bucket))
        lines.push(`  - ${k}: ${v}`);
      lines.push("");

      type F = { filename: string; folder: string; uploaded_at: string };
      const files = (recentFiles.data ?? []) as F[];
      lines.push(`## Recent files (${files.length})`);
      if (files.length === 0) lines.push("  (none)");
      for (const f of files)
        lines.push(
          `  - ${f.folder === "/" ? "" : f.folder + "/"}${f.filename}`,
        );
      lines.push("");

      type Inv = { email: string; role: string };
      const invites = (pendingInvites.data ?? []) as Inv[];
      if (invites.length > 0) {
        lines.push(`## Pending invites (${invites.length})`);
        for (const i of invites) lines.push(`  - ${i.email} → ${i.role}`);
        lines.push("");
      }

      lines.push(
        "---",
        "Draft a 3-sentence summary for the space owner highlighting risks and next actions.",
      );
      return textResult(lines.join("\n"));
    },
  },

  {
    name: "rokki_what_changed",
    description:
      "What changed in one (or all) of my terminals since a given date. Returns a structured feed the caller can paraphrase into a status update.",
    inputSchema: {
      type: "object",
      properties: {
        terminal: {
          type: "string",
          description: "Optional: scope to one terminal by ticker or name.",
        },
        since: {
          type: "string",
          description:
            "ISO date or duration shorthand (e.g. '24h', '3d', '2w'). Default '24h'.",
        },
      },
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const sinceArg = String(args.since ?? "24h");
      const sinceMs = parseSince(sinceArg);
      if (!sinceMs)
        return textResult(
          `Invalid "since" — use ISO date or shorthand like 24h, 3d, 2w.`,
          true,
        );

      let projectIds: string[];
      let scopeLabel = "all your terminals";
      if (args.terminal) {
        const scoped = await resolveProject(session, String(args.terminal));
        if (!scoped) return textResult("Terminal not found.", true);
        projectIds = [scoped.id];
        scopeLabel = scoped.name;
      } else {
        const all = await loadAccessibleProjects(session);
        projectIds = all.map((p) => p.id);
      }
      if (projectIds.length === 0) return textResult("No terminals accessible.");

      const { data } = await admin
        .from("activity")
        .select("action, actor_id, terminal_id, metadata, created_at")
        .in("terminal_id", projectIds)
        .gte("created_at", new Date(Date.now() - sinceMs).toISOString())
        .order("created_at", { ascending: false })
        .limit(200);

      type Row = {
        action: string;
        actor_id: string | null;
        terminal_id: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      };
      const rows = (data ?? []) as Row[];
      const lines: string[] = [];
      lines.push(`# Changes in ${scopeLabel}`);
      lines.push(`Window: last ${sinceArg}`);
      lines.push("");
      if (rows.length === 0) {
        lines.push("(nothing happened)");
        return textResult(lines.join("\n"));
      }
      const byAction: Record<string, number> = {};
      for (const r of rows) byAction[r.action] = (byAction[r.action] ?? 0) + 1;
      for (const [k, v] of Object.entries(byAction).sort(
        (a, b) => b[1] - a[1],
      ))
        lines.push(`- ${k}: ${v}`);
      lines.push("");
      lines.push("## Timeline (most recent first)");
      for (const r of rows.slice(0, 40))
        lines.push(
          `- ${new Date(r.created_at).toLocaleString()} · ${describeAction(r.action, r.metadata)}`,
        );
      return textResult(lines.join("\n"));
    },
  },

  {
    name: "rokki_draft_update",
    description:
      "Return a structured brief for a status update email — the LLM turns the raw structure into polished prose. Covers: closed tasks, open tasks, blockers, files shipped, and asks of the reader.",
    inputSchema: {
      type: "object",
      properties: {
        terminal: { type: "string" },
        audience: {
          type: "string",
          description:
            "Who is the update for? e.g. 'client', 'internal team', 'investor'. Shapes the tone hint.",
        },
      },
      required: ["terminal"],
      additionalProperties: false,
    },
    handler: async (args, session) => {
      const project = await resolveProject(
        session,
        String(args.terminal ?? "").trim(),
      );
      if (!project) return textResult("Terminal not found.", true);
      const audience = String(args.audience ?? "team");

      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [done, open, blocked, files] = await Promise.all([
        admin
          .from("tasks")
          .select("title, completed_at")
          .eq("terminal_id", project.id)
          .eq("status", "done")
          .gte("completed_at", since)
          .limit(20),
        admin
          .from("tasks")
          .select("ticker_seq, title, priority, due_date")
          .eq("terminal_id", project.id)
          .neq("status", "done")
          .order("priority", { ascending: true })
          .limit(15),
        admin
          .from("tasks")
          .select("ticker_seq, title")
          .eq("terminal_id", project.id)
          .eq("status", "blocked"),
        admin
          .from("files")
          .select("filename")
          .eq("terminal_id", project.id)
          .is("deleted_at", null)
          .gte("uploaded_at", since)
          .limit(10),
      ]);

      type DoneT = { title: string };
      type OpenT = {
        ticker_seq: number;
        title: string;
        priority: number;
        due_date: string | null;
      };
      type BlockT = { ticker_seq: number; title: string };
      type FileT = { filename: string };

      const lines: string[] = [];
      lines.push(`# Update for ${audience} — ${project.name}`);
      lines.push(`Tone hint: ${audience}`);
      lines.push(
        "Synthesize into 4-6 short paragraphs: headline progress, blockers, next steps, and an ask for the reader.",
      );
      lines.push("");
      lines.push(`## Closed this week (${(done.data ?? []).length})`);
      for (const t of (done.data ?? []) as DoneT[])
        lines.push(`- ${t.title}`);
      lines.push("");
      lines.push(`## In flight (${(open.data ?? []).length})`);
      for (const t of (open.data ?? []) as OpenT[])
        lines.push(
          `- #${t.ticker_seq} ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`,
        );
      lines.push("");
      if ((blocked.data ?? []).length > 0) {
        lines.push(`## Blocked (${(blocked.data ?? []).length})`);
        for (const t of (blocked.data ?? []) as BlockT[])
          lines.push(`- #${t.ticker_seq} ${t.title}`);
        lines.push("");
      }
      lines.push(`## Files shipped this week (${(files.data ?? []).length})`);
      for (const f of (files.data ?? []) as FileT[]) lines.push(`- ${f.filename}`);
      return textResult(lines.join("\n"));
    },
  },
];

/* -------------------------------------------------------------------------- */

/** Render a folder+filename pair for user-facing messages, collapsing the
 * redundant leading `/` when folder is root. */
function prettyPath(folder: string, filename: string): string {
  return folder === "/" ? `/${filename}` : `${folder}/${filename}`;
}

/**
 * Parse a "since" argument into a milliseconds offset. Accepts ISO dates
 * and shorthand like "24h", "3d", "2w". Returns the number of milliseconds
 * to subtract from now, or null if unparseable.
 */
function parseSince(s: string): number | null {
  const trimmed = s.trim();
  const shorthand = trimmed.match(/^(\d+)\s*([hdw])$/i);
  if (shorthand) {
    const n = Number(shorthand[1]);
    const unit = shorthand[2].toLowerCase();
    const mult = unit === "h" ? 3600_000 : unit === "d" ? 86_400_000 : 7 * 86_400_000;
    return n * mult;
  }
  const iso = new Date(trimmed);
  if (!isNaN(iso.getTime())) {
    const ms = Date.now() - iso.getTime();
    return ms > 0 ? ms : null;
  }
  return null;
}

/**
 * Short snippet around the first case-insensitive match of any query term.
 * Falls back to the start of the text if no term hits.
 */
function snippetAround(text: string, query: string, radius: number): string {
  const lower = text.toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  let hit = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (hit < 0 || i < hit)) hit = i;
  }
  const start = hit >= 0 ? Math.max(0, hit - Math.floor(radius / 2)) : 0;
  const end = Math.min(text.length, start + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return (
    prefix + text.slice(start, end).replace(/\s+/g, " ").trim() + suffix
  );
}

function describeAction(
  action: string,
  metadata: Record<string, unknown> | null,
): string {
  const m = metadata ?? {};
  const pick = (key: string): string | null => {
    const v = (m as Record<string, unknown>)[key];
    return typeof v === "string" ? v : null;
  };
  switch (action) {
    case "terminal.create":
      return `created terminal ${pick("ticker") ? `(${pick("ticker")}) ` : ""}${pick("name") ?? ""}`.trim();
    case "terminal.update":
      return "updated terminal";
    case "terminal.archive":
      return "archived space";
    case "member.invite":
      return `invited ${pick("email") ?? "a member"}`;
    case "member.join":
      return `joined the space`;
    case "task.create":
      return `created task ${pick("title") ? `"${pick("title")}"` : ""}`.trim();
    case "task.update":
      return "updated a task";
    case "task.complete":
      return "completed a task";
    case "task.delete":
      return `deleted task ${pick("title") ? `"${pick("title")}"` : ""}`.trim();
    case "file.upload": {
      const op = pick("op");
      if (op === "file.duplicate") return `duplicated ${pick("filename") ?? "a file"}`;
      if (op === "folder.create") return `created folder ${pick("path") ?? ""}`.trim();
      return `uploaded ${pick("filename") ?? "a file"}`;
    }
    case "file.update": {
      const op = pick("op");
      if (op === "file.rename")
        return `renamed ${pick("from") ?? ""} → ${pick("to") ?? ""}`;
      if (op === "file.move")
        return `moved a file ${pick("from") ?? ""} → ${pick("to") ?? ""}`;
      if (op === "folder.rename")
        return `renamed folder ${pick("from") ?? ""} → ${pick("to") ?? ""}`;
      return "updated a file";
    }
    case "file.delete":
      return `deleted ${pick("filename") ?? pick("path") ?? "something"}`;
    case "file.download":
      return `read ${pick("filename") ?? "a file"}`;
    case "tool.invoke": {
      const slug = pick("slug");
      const status = pick("status");
      const ms = typeof m.duration_ms === "number" ? `${m.duration_ms}ms` : null;
      const bits = [
        `called tool ${slug ? `"${slug}"` : ""}`,
        status && status !== "success" ? `(${status})` : null,
        ms,
      ].filter(Boolean);
      return bits.join(" ");
    }
    case "tool.publish":
      return `published tool ${pick("slug") ? `"${pick("slug")}"` : ""}`.trim();
    case "tool.approve":
      return `approved tool ${pick("slug") ?? ""}`;
    case "tool.deny":
      return `denied tool ${pick("slug") ?? ""}`;
    default:
      return action;
  }
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isText(mime: string, filename: string): boolean {
  if (!mime) mime = "";
  if (mime.startsWith("text/")) return true;
  if (
    [
      "application/json",
      "application/xml",
      "application/javascript",
      "application/x-yaml",
      "application/yaml",
      "application/x-httpd-php",
    ].includes(mime)
  )
    return true;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return [
    "txt",
    "md",
    "markdown",
    "json",
    "csv",
    "tsv",
    "yaml",
    "yml",
    "xml",
    "html",
    "css",
    "js",
    "ts",
    "tsx",
    "jsx",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "sh",
    "bash",
    "env",
    "log",
    "ini",
    "conf",
    "toml",
  ].includes(ext);
}

export function listTools(session: AuthedSession): ToolDefinition[] {
  const canWrite = session.scopes.includes("write");
  return TOOLS.filter((t) => canWrite || !t.requiresWrite);
}

export function findTool(name: string): ToolDefinition | null {
  return TOOLS.find((t) => t.name === name) ?? null;
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface ProjectRef {
  id: string;
  space_id: string;
  ticker: string;
  name: string;
  status: string;
}

async function loadAccessibleProjects(
  session: AuthedSession,
): Promise<ProjectRef[]> {
  // Caller's terminals via terminal_members OR space admin membership.
  const [{ data: directRows }, { data: spaceRows }] = await Promise.all([
    admin
      .from("terminal_members")
      .select(
        "terminals:terminals!terminal_members_terminal_id_fkey(id, space_id, ticker, name, status, archived_at)",
      )
      .eq("user_id", session.userId),
    admin
      .from("space_members")
      .select(
        "spaces:spaces!space_members_space_id_fkey(id, terminals:terminals!terminals_space_id_fkey(id, space_id, ticker, name, status, archived_at))",
      )
      .eq("user_id", session.userId)
      .in("role", ["owner", "admin"]),
  ]);

  const collected = new Map<string, ProjectRef>();

  type DirectRow = {
    terminals: (Partial<ProjectRef> & { archived_at: string | null }) | null;
  };
  for (const row of ((directRows ?? []) as unknown) as DirectRow[]) {
    const p = row.terminals;
    if (p && p.id && !p.archived_at) {
      collected.set(p.id, {
        id: p.id,
        space_id: p.space_id!,
        ticker: p.ticker!,
        name: p.name!,
        status: p.status!,
      });
    }
  }

  type SpaceRow = {
    spaces: {
      id: string;
      terminals:
        | (Partial<ProjectRef> & { archived_at: string | null })[]
        | null;
    } | null;
  };
  for (const row of ((spaceRows ?? []) as unknown) as SpaceRow[]) {
    for (const p of row.spaces?.terminals ?? []) {
      if (p.id && !p.archived_at) {
        collected.set(p.id, {
          id: p.id,
          space_id: p.space_id!,
          ticker: p.ticker!,
          name: p.name!,
          status: p.status!,
        });
      }
    }
  }

  let rows = Array.from(collected.values());

  // Apply token-level project restrictions if any
  if (session.projectRestrictions && session.projectRestrictions.length > 0) {
    const allow = new Set(session.projectRestrictions);
    rows = rows.filter((r) => allow.has(r.id));
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

async function resolveProject(
  session: AuthedSession,
  hint: string,
): Promise<ProjectRef | null> {
  const all = await loadAccessibleProjects(session);
  const upper = hint.toUpperCase();
  return (
    all.find((p) => p.ticker === upper) ??
    all.find((p) => p.name.toLowerCase() === hint.toLowerCase()) ??
    all.find((p) =>
      p.name.toLowerCase().includes(hint.toLowerCase()),
    ) ??
    null
  );
}

/** Resolve a space (tenant) by slug or name from the user's memberships. */
async function resolveSpaceByHint(
  userId: string,
  hint: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  const { data } = await admin
    .from("space_members")
    .select("spaces!space_members_space_id_fkey(id, slug, name)")
    .eq("user_id", userId);
  type Row = {
    spaces: { id: string; slug: string; name: string } | null;
  };
  const rows = ((data ?? []) as unknown as Row[])
    .map((r) => r.spaces)
    .filter((s): s is { id: string; slug: string; name: string } => !!s);
  const lower = hint.toLowerCase();
  return (
    rows.find((s) => s.slug === lower) ??
    rows.find((s) => s.name.toLowerCase() === lower) ??
    rows.find((s) => s.name.toLowerCase().includes(lower)) ??
    null
  );
}

function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}
