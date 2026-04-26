"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Upload,
  Trash2,
  Download,
  RotateCcw,
  ArrowLeft,
  FolderPlus,
  Folder as FolderIcon,
  Pencil,
  ChevronRight,
  Copy as CopyIcon,
  Lock,
  Users as UsersIcon,
  UserCheck,
  X,
} from "lucide-react";
import {
  FilePermissionsDialog,
  type FileVisibility,
  type ProjectRole,
} from "./FilePermissionsDialog";
import { cn } from "@/lib/utils";
import { breadcrumbOf, isValidFolderName } from "@/lib/folder-path";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { useRegisterCommands } from "@/lib/use-register-commands";

interface FileRow {
  id: string;
  filename: string;
  folder: string;
  mime_type: string;
  size_bytes: number;
  visibility: FileVisibility;
  visibility_roles: ProjectRole[];
  visibility_users: string[];
  version: number;
  virus_scan_status?: "pending" | "clean" | "infected" | "skipped";
  uploaded_at: string;
  uploaded_by: string;
  deleted_at: string | null;
}

interface FolderRow {
  id: string;
  path: string;
  name: string;
  parent_path: string;
}

interface FilesPaneProps {
  ticker: string;
  projectId: string;
}

type View = "live" | "trash";

/** A single in-flight upload tracked for the per-file progress strip. */
interface UploadJob {
  /** Stable client id; not the eventual file id. */
  id: string;
  filename: string;
  size: number;
  loaded: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  xhr?: XMLHttpRequest;
}

/** Cap concurrent uploads so a 50-file drop doesn't saturate the server. */
const MAX_PARALLEL_UPLOADS = 3;

const IMAGE_MIME_PREFIX = "image/";
const PREVIEWABLE_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export function FilesPane({ ticker, projectId }: FilesPaneProps) {
  const [view, setView] = useState<View>("live");
  const [currentFolder, setCurrentFolder] = useState("/");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  /** File whose permissions dialog is currently open. */
  const [permFile, setPermFile] = useState<FileRow | null>(null);
  /** When the user drags a file row from within the list, we remember its id here. */
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  /** File ids the user has selected via click / shift-click / cmd-click. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Anchor for shift-click range expansion. */
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  /** Move-to-folder picker is open when this is true. */
  const [movePickerOpen, setMovePickerOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  /** Counter for nested dragenter / dragleave events on the pane. */
  const dragDepthRef = useRef(0);

  const isTrash = view === "trash";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isTrash) {
        const r = await fetch(`/api/v1/projects/${ticker}/files?trash=1`, {
          credentials: "include",
        });
        const body = (await r.json()) as { data?: FileRow[] };
        setFiles(body.data ?? []);
        setFolders([]);
      } else {
        const [filesRes, foldersRes, trashRes] = await Promise.all([
          fetch(
            `/api/v1/projects/${ticker}/files?folder=${encodeURIComponent(currentFolder)}`,
            { credentials: "include" },
          ),
          fetch(`/api/v1/projects/${ticker}/folders`, { credentials: "include" }),
          fetch(`/api/v1/projects/${ticker}/files?trash=1`, {
            credentials: "include",
          }),
        ]);
        const filesBody = (await filesRes.json()) as { data?: FileRow[] };
        const foldersBody = (await foldersRes.json()) as { data?: FolderRow[] };
        const trashBody = (await trashRes.json()) as { data?: FileRow[] };
        setFiles(filesBody.data ?? []);
        setFolders(foldersBody.data ?? []);
        setTrashCount(trashBody.data?.length ?? 0);
      }
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [ticker, currentFolder, isTrash]);

  useEffect(() => {
    void load();
  }, [load]);

  // Clear selection whenever the visible folder or view changes — selecting
  // files in /a then jumping to /b would otherwise leave invisible items
  // selected and make the bottom bar count lie.
  useEffect(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, [currentFolder, view]);

  // Realtime: debounced refetch when files or folders change under this
  // project. Files state is entangled (trash count, active folder contents,
  // in-flight renames), so a small refetch is both simpler and correct.
  // We coalesce bursts of events (e.g. the rename-folder cascade touches
  // dozens of rows) into a single reload.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void load();
    }, 250);
  }, [load]);
  useRealtimeTable<FileRow>(
    {
      table: "files",
      filter: `terminal_id=eq.${projectId}`,
      channelKey: `files:${projectId}`,
    },
    {
      onInsert: scheduleReload,
      onUpdate: scheduleReload,
      onDelete: scheduleReload,
    },
  );
  useRealtimeTable<FolderRow>(
    {
      table: "folders",
      filter: `terminal_id=eq.${projectId}`,
      channelKey: `folders:${projectId}`,
    },
    {
      onInsert: scheduleReload,
      onUpdate: scheduleReload,
      onDelete: scheduleReload,
    },
  );

  const childFolders = folders.filter((f) => f.parent_path === currentFolder);

  const paletteCommands = useMemo(
    () => [
      {
        id: `files/upload:${projectId}`,
        title: "Upload file",
        subtitle: currentFolder,
        category: "action" as const,
        icon: <Upload className="h-4 w-4" />,
        onRun: () => inputRef.current?.click(),
      },
      {
        id: `files/camera:${projectId}`,
        title: "Take photo and upload",
        subtitle: currentFolder,
        category: "action" as const,
        icon: <Upload className="h-4 w-4" />,
        onRun: () => cameraRef.current?.click(),
      },
      {
        id: `files/new-folder:${projectId}`,
        title: "New folder",
        subtitle: currentFolder,
        category: "action" as const,
        icon: <FolderPlus className="h-4 w-4" />,
        onRun: () => setNewFolderOpen(true),
      },
      {
        id: `files/trash:${projectId}`,
        title: view === "trash" ? "Exit trash" : "Show trash",
        category: "action" as const,
        icon: <Trash2 className="h-4 w-4" />,
        onRun: () => setView(view === "trash" ? "live" : "trash"),
      },
    ],
    [projectId, currentFolder, view],
  );
  useRegisterCommands(`files:${projectId}`, paletteCommands);

  /**
   * Run one upload via XHR so we can stream upload.onprogress into the
   * per-file progress strip. fetch() can't report request body progress in
   * any browser.
   */
  const runUpload = useCallback(
    (job: UploadJob, file: File): Promise<void> => {
      return new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/v1/projects/${ticker}/files`, true);
        xhr.withCredentials = true;
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          setUploads((prev) =>
            prev.map((u) =>
              u.id === job.id ? { ...u, loaded: e.loaded, status: "uploading" } : u,
            ),
          );
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === job.id
                  ? { ...u, status: "done", loaded: u.size, xhr: undefined }
                  : u,
              ),
            );
          } else {
            let msg = `Upload failed (${xhr.status})`;
            try {
              const body = JSON.parse(xhr.responseText) as {
                errors?: { message: string }[];
              };
              if (body.errors?.[0]?.message) msg = body.errors[0].message;
            } catch {
              /* keep generic */
            }
            setUploads((prev) =>
              prev.map((u) =>
                u.id === job.id
                  ? { ...u, status: "error", error: msg, xhr: undefined }
                  : u,
              ),
            );
            setError(`${job.filename}: ${msg}`);
          }
          resolve();
        };
        xhr.onerror = () => {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === job.id
                ? {
                    ...u,
                    status: "error",
                    error: "Network error",
                    xhr: undefined,
                  }
                : u,
            ),
          );
          setError(`${job.filename}: network error`);
          resolve();
        };
        xhr.onabort = () => {
          setUploads((prev) => prev.filter((u) => u.id !== job.id));
          resolve();
        };

        const form = new FormData();
        form.append("file", file);
        form.append("folder", currentFolder);

        // Stash the xhr ref so the row's cancel button can abort.
        setUploads((prev) =>
          prev.map((u) => (u.id === job.id ? { ...u, status: "uploading", xhr } : u)),
        );
        xhr.send(form);
      });
    },
    [ticker, currentFolder],
  );

  const uploadMany = useCallback(
    async (list: FileList | File[]) => {
      if (isTrash) return;
      const incoming = Array.from(list);
      if (incoming.length === 0) return;

      setError(null);
      // Validate and seed jobs up front so the UI shows a queue immediately.
      const accepted: { job: UploadJob; file: File }[] = [];
      const fresh: UploadJob[] = [];
      for (const file of incoming) {
        if (file.size > 25 * 1024 * 1024) {
          setError(`${file.name} exceeds 25 MB.`);
          continue;
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const job: UploadJob = {
          id,
          filename: file.name,
          size: file.size,
          loaded: 0,
          status: "queued",
        };
        accepted.push({ job, file });
        fresh.push(job);
      }
      if (fresh.length === 0) return;
      setUploads((prev) => [...prev, ...fresh]);

      // Worker pool — at most MAX_PARALLEL_UPLOADS at a time.
      let cursor = 0;
      const next = async (): Promise<void> => {
        const idx = cursor++;
        if (idx >= accepted.length) return;
        const { job, file } = accepted[idx];
        await runUpload(job, file);
        await next();
      };
      await Promise.all(
        Array.from(
          { length: Math.min(MAX_PARALLEL_UPLOADS, accepted.length) },
          () => next(),
        ),
      );

      // Reload once at the end so freshly inserted rows surface; realtime will
      // also cover this but reload is the deterministic path.
      await load();
    },
    [isTrash, runUpload, load],
  );

  function clearFinishedUploads() {
    setUploads((prev) => prev.filter((u) => u.status !== "done"));
  }

  function cancelUpload(id: string) {
    setUploads((prev) => {
      const target = prev.find((u) => u.id === id);
      if (target?.xhr) target.xhr.abort();
      return prev;
    });
  }

  async function createFolder(name: string) {
    const r = await fetch(`/api/v1/projects/${ticker}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent: currentFolder }),
      credentials: "include",
    });
    const body = (await r.json()) as { errors?: { message: string }[] };
    if (!r.ok) {
      setError(body.errors?.[0]?.message ?? "Could not create folder");
      return;
    }
    setNewFolderOpen(false);
    await load();
  }

  async function renameFolder(id: string, name: string) {
    const r = await fetch(`/api/v1/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      credentials: "include",
    });
    const body = (await r.json()) as {
      data?: { path: string };
      errors?: { message: string }[];
    };
    if (!r.ok) {
      setError(body.errors?.[0]?.message ?? "Could not rename");
      return;
    }
    setRenamingFolderId(null);
    const oldFolder = folders.find((f) => f.id === id);
    if (oldFolder && body.data) {
      if (currentFolder === oldFolder.path) {
        setCurrentFolder(body.data.path);
      } else if (currentFolder.startsWith(oldFolder.path + "/")) {
        setCurrentFolder(
          body.data.path + currentFolder.slice(oldFolder.path.length),
        );
      }
    }
    await load();
  }

  async function deleteFolder(id: string, path: string) {
    if (
      !confirm(
        `Move "${path}" and everything inside it to Trash? Files can still be restored.`,
      )
    )
      return;
    const r = await fetch(`/api/v1/folders/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) await load();
  }

  async function softDeleteFile(id: string, filename: string) {
    if (!confirm(`Move ${filename} to Trash?`)) return;
    const r = await fetch(`/api/v1/files/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) await load();
  }

  async function restore(id: string) {
    const r = await fetch(`/api/v1/files/${id}/restore`, {
      method: "POST",
      credentials: "include",
    });
    if (r.ok) await load();
  }

  async function permanent(id: string, filename: string) {
    if (
      !confirm(
        `Permanently delete ${filename}? This removes the file from storage and cannot be undone.`,
      )
    )
      return;
    const r = await fetch(`/api/v1/files/${id}/permanent`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) await load();
  }

  async function renameFile(id: string, newName: string) {
    const r = await fetch(`/api/v1/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: newName }),
      credentials: "include",
    });
    if (r.ok) {
      setRenamingFileId(null);
      await load();
    } else {
      const body = (await r.json().catch(() => ({}))) as {
        errors?: { message: string }[];
      };
      setError(body.errors?.[0]?.message ?? "Rename failed");
    }
  }

  async function moveFile(fileId: string, destFolder: string) {
    const r = await fetch(`/api/v1/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: destFolder }),
      credentials: "include",
    });
    if (r.ok) await load();
  }

  async function duplicateFile(id: string) {
    const r = await fetch(`/api/v1/files/${id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "include",
    });
    if (r.ok) await load();
  }

  async function duplicateFolder(id: string) {
    const r = await fetch(`/api/v1/folders/${id}/duplicate`, {
      method: "POST",
      credentials: "include",
    });
    if (r.ok) await load();
  }

  /* ---------------------------------------------------------------------- */
  /* Multi-select                                                            */
  /* ---------------------------------------------------------------------- */

  /** Click handler for a row's main hit-box. Modifier keys steer behaviour. */
  function selectFile(id: string, e: React.MouseEvent) {
    if (e.shiftKey && lastSelectedId) {
      // Range select: anchor → current within the visible files list.
      const ids = files.map((f) => f.id);
      const a = ids.indexOf(lastSelectedId);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = ids.slice(lo, hi + 1);
        setSelectedIds(new Set(range));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastSelectedId(id);
      return;
    }
    // Plain click toggles single-select.
    setSelectedIds((prev) => {
      if (prev.size === 1 && prev.has(id)) return new Set();
      return new Set([id]);
    });
    setLastSelectedId(id);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }

  async function bulkDelete() {
    const items = files.filter((f) => selectedIds.has(f.id));
    if (items.length === 0) return;
    if (!confirm(`Move ${items.length} file${items.length === 1 ? "" : "s"} to Trash?`))
      return;
    await Promise.all(
      items.map((f) =>
        fetch(`/api/v1/files/${f.id}`, {
          method: "DELETE",
          credentials: "include",
        }),
      ),
    );
    clearSelection();
    await load();
  }

  function bulkDownload() {
    const items = files.filter((f) => selectedIds.has(f.id));
    // Sequential anchor clicks — the browser will fan them into separate
    // downloads. Most browsers throttle multi-download prompts; this is fine
    // for the typical 2–10 selection size.
    for (const f of items) {
      const a = document.createElement("a");
      a.href = `/api/v1/files/${f.id}/download`;
      a.rel = "noopener";
      a.click();
    }
  }

  async function bulkMove(destFolder: string) {
    const items = files.filter((f) => selectedIds.has(f.id));
    if (items.length === 0) return;
    await Promise.all(
      items.map((f) =>
        fetch(`/api/v1/files/${f.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: destFolder }),
          credentials: "include",
        }),
      ),
    );
    clearSelection();
    setMovePickerOpen(false);
    await load();
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={(e) => {
        if (isTrash) return;
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragDepthRef.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (isTrash) return;
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (isTrash) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setDragging(false);
        if (e.dataTransfer.files.length) void uploadMany(e.dataTransfer.files);
      }}
    >
      {isTrash ? (
        <TrashHeader count={files.length} onBack={() => setView("live")} />
      ) : (
        <LiveHeader
          breadcrumb={breadcrumbOf(currentFolder)}
          onPick={(p) => setCurrentFolder(p)}
          trashCount={trashCount}
          onOpenTrash={() => setView("trash")}
          onNewFolder={() => setNewFolderOpen(true)}
          onUpload={() => inputRef.current?.click()}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void uploadMany(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void uploadMany(e.target.files);
          e.target.value = "";
        }}
      />

      {error ? (
        <div className="border-b border-border bg-danger-subtle px-4 py-2 text-xs text-danger">
          {error}
        </div>
      ) : null}

      <UploadStrip
        uploads={uploads}
        onCancel={cancelUpload}
        onClearDone={clearFinishedUploads}
      />

      <div
        className={cn(
          "flex-1 overflow-y-auto transition-colors",
          dragging && !isTrash && "bg-accent-subtle/30",
        )}
      >
        {loading ? (
          <Skeleton />
        ) : (
          <>
            {newFolderOpen ? (
              <NewFolderInline
                onSubmit={createFolder}
                onCancel={() => setNewFolderOpen(false)}
              />
            ) : null}

            {!isTrash && childFolders.length > 0 ? (
              <ul className="divide-y divide-border">
                {childFolders.map((f) => (
                  <FolderItem
                    key={f.id}
                    folder={f}
                    renaming={renamingFolderId === f.id}
                    isDropTarget={dropTargetPath === f.path}
                    onOpen={() => setCurrentFolder(f.path)}
                    onStartRename={() => setRenamingFolderId(f.id)}
                    onSubmitRename={(name) => renameFolder(f.id, name)}
                    onCancelRename={() => setRenamingFolderId(null)}
                    onDuplicate={() => duplicateFolder(f.id)}
                    onDelete={() => deleteFolder(f.id, f.path)}
                    onDragEnter={() => setDropTargetPath(f.path)}
                    onDragLeave={() => setDropTargetPath(null)}
                    onDropFile={() => {
                      if (draggingFileId) void moveFile(draggingFileId, f.path);
                      setDropTargetPath(null);
                      setDraggingFileId(null);
                    }}
                  />
                ))}
              </ul>
            ) : null}

            {files.length > 0 ? (
              <ul className="divide-y divide-border">
                {files.map((file) =>
                  isTrash ? (
                    <TrashItem
                      key={file.id}
                      file={file}
                      onRestore={() => restore(file.id)}
                      onPermanent={() => permanent(file.id, file.filename)}
                    />
                  ) : (
                    <FileItem
                      key={file.id}
                      file={file}
                      ticker={ticker}
                      renaming={renamingFileId === file.id}
                      currentFolder={currentFolder}
                      selected={selectedIds.has(file.id)}
                      onSelect={(e) => selectFile(file.id, e)}
                      onStartRename={() => setRenamingFileId(file.id)}
                      onSubmitRename={(name) => renameFile(file.id, name)}
                      onCancelRename={() => setRenamingFileId(null)}
                      onDuplicate={() => duplicateFile(file.id)}
                      onDelete={() => softDeleteFile(file.id, file.filename)}
                      onEditPermissions={() => setPermFile(file)}
                      onDragStart={() => setDraggingFileId(file.id)}
                      onDragEnd={() => {
                        setDraggingFileId(null);
                        setDropTargetPath(null);
                      }}
                    />
                  ),
                )}
              </ul>
            ) : null}

            {!loading &&
            !newFolderOpen &&
            childFolders.length === 0 &&
            files.length === 0 ? (
              isTrash ? (
                <EmptyTrash />
              ) : (
                <EmptyFolder
                  onUpload={() => inputRef.current?.click()}
                  onNewFolder={() => setNewFolderOpen(true)}
                  atRoot={currentFolder === "/"}
                />
              )
            ) : null}
          </>
        )}
      </div>

      {dragging && !isTrash ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-0/40 backdrop-blur-sm">
          <div className="rounded border-2 border-dashed border-accent bg-bg-1/90 px-6 py-4 text-center shadow-lg">
            <Upload className="mx-auto mb-2 h-5 w-5 text-accent" aria-hidden="true" />
            <p className="text-sm font-semibold text-text-0">
              Drop to upload to{" "}
              <span className="font-mono text-accent">{currentFolder}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-text-3">
              Multiple files OK · 25 MB each
            </p>
          </div>
        </div>
      ) : null}

      {selectedIds.size > 0 && !isTrash ? (
        <SelectionBar
          count={selectedIds.size}
          onClear={clearSelection}
          onDownload={bulkDownload}
          onMove={() => setMovePickerOpen(true)}
          onDelete={bulkDelete}
        />
      ) : null}

      {movePickerOpen ? (
        <MoveToFolderPicker
          folders={folders}
          currentFolder={currentFolder}
          onCancel={() => setMovePickerOpen(false)}
          onPick={(p) => void bulkMove(p)}
        />
      ) : null}

      {permFile ? (
        <FilePermissionsDialog
          open={Boolean(permFile)}
          onClose={() => setPermFile(null)}
          file={{
            id: permFile.id,
            filename: permFile.filename,
            visibility: permFile.visibility,
            visibility_roles: permFile.visibility_roles,
            visibility_users: permFile.visibility_users,
          }}
          ticker={ticker}
          onSaved={(next) =>
            setFiles((prev) =>
              prev.map((f) =>
                f.id === permFile.id ? { ...f, ...next } : f,
              ),
            )
          }
        />
      ) : null}
    </div>
  );
}

/** Short description used in the row button's tooltip. */
function visibilityLabel(v: FileVisibility): string {
  switch (v) {
    case "project":
      return "Visible to everyone in the terminal";
    case "owners":
      return "Owners and managers only";
    case "custom":
      return "Custom permissions — click to edit";
  }
}

/* ------------------------------------------------------------------------- */
/* Headers                                                                    */
/* ------------------------------------------------------------------------- */

function LiveHeader({
  breadcrumb,
  onPick,
  trashCount,
  onOpenTrash,
  onNewFolder,
  onUpload,
}: {
  breadcrumb: { name: string; path: string }[];
  onPick: (p: string) => void;
  trashCount: number;
  onOpenTrash: () => void;
  onNewFolder: () => void;
  onUpload: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
        {breadcrumb.map((b, i) => {
          const last = i === breadcrumb.length - 1;
          return (
            <span key={b.path} className="flex items-center gap-1">
              {i > 0 ? (
                <ChevronRight className="h-3 w-3 text-text-3" aria-hidden="true" />
              ) : null}
              {last ? (
                <span className="font-semibold text-text-0">{b.name}</span>
              ) : (
                <button
                  onClick={() => onPick(b.path)}
                  className="text-text-2 hover:text-text-0"
                >
                  {b.name}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex items-center gap-1">
        {trashCount > 0 ? (
          <button
            onClick={onOpenTrash}
            className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
          >
            <Trash2 className="h-3 w-3" /> Trash ({trashCount})
          </button>
        ) : null}
        <button
          onClick={onNewFolder}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
        >
          <FolderPlus className="h-3 w-3" /> New folder
        </button>
        <button
          onClick={onUpload}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
        >
          <Upload className="h-3 w-3" /> Upload
        </button>
      </div>
    </div>
  );
}

function TrashHeader({
  count,
  onBack,
}: {
  count: number;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
        <h2 className="text-sm font-semibold text-text-0">Trash</h2>
        <span className="font-mono text-xs text-text-3">{count}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Upload strip                                                                */
/* ------------------------------------------------------------------------- */

function UploadStrip({
  uploads,
  onCancel,
  onClearDone,
}: {
  uploads: UploadJob[];
  onCancel: (id: string) => void;
  onClearDone: () => void;
}) {
  if (uploads.length === 0) return null;
  const active = uploads.filter((u) => u.status !== "done");
  const doneCount = uploads.length - active.length;
  return (
    <div className="border-b border-border bg-bg-1">
      <div className="flex items-center justify-between px-4 py-1.5 text-[11px] text-text-3">
        <span className="font-mono uppercase tracking-wide">
          {active.length > 0
            ? `Uploading ${active.length} of ${uploads.length}`
            : "All uploads complete"}
        </span>
        {doneCount > 0 ? (
          <button
            onClick={onClearDone}
            className="text-text-3 hover:text-text-1"
          >
            Clear done
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {uploads.map((u) => {
          const pct =
            u.size > 0 ? Math.min(100, Math.round((u.loaded / u.size) * 100)) : 0;
          return (
            <li key={u.id} className="px-4 py-1.5">
              <div className="flex items-center gap-2 text-xs">
                <FileText className="h-3 w-3 flex-shrink-0 text-text-3" aria-hidden="true" />
                <span className="flex-1 truncate text-text-1" title={u.filename}>
                  {u.filename}
                </span>
                <span className="font-mono text-[10px] text-text-3">
                  {formatSize(u.loaded)} / {formatSize(u.size)}
                </span>
                {u.status === "uploading" || u.status === "queued" ? (
                  <button
                    onClick={() => onCancel(u.id)}
                    aria-label="Cancel upload"
                    title="Cancel upload"
                    className="rounded-sm p-0.5 text-text-3 hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : u.status === "error" ? (
                  <span
                    className="font-mono text-[10px] uppercase text-danger"
                    title={u.error ?? "Failed"}
                  >
                    Failed
                  </span>
                ) : (
                  <span className="font-mono text-[10px] uppercase text-success">
                    Done
                  </span>
                )}
              </div>
              <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-bg-3">
                <div
                  className={cn(
                    "h-full transition-all",
                    u.status === "error"
                      ? "bg-danger"
                      : u.status === "done"
                        ? "bg-success"
                        : "bg-accent",
                  )}
                  style={{ width: `${u.status === "queued" ? 2 : pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Selection action bar + move picker                                           */
/* ------------------------------------------------------------------------- */

function SelectionBar({
  count,
  onClear,
  onDownload,
  onMove,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onDownload: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-bg-1 px-4 py-2 shadow-lg">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-sm bg-accent-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
          {count} selected
        </span>
        <button
          onClick={onClear}
          className="text-text-3 hover:text-text-1"
          title="Clear selection"
        >
          Clear
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onDownload}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-1 hover:bg-bg-2 hover:text-text-0"
        >
          <Download className="h-3 w-3" /> Download {count}
        </button>
        <button
          onClick={onMove}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-1 hover:bg-bg-2 hover:text-text-0"
        >
          <FolderIcon className="h-3 w-3" /> Move to…
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-1 hover:bg-danger/20 hover:text-danger"
        >
          <Trash2 className="h-3 w-3" /> Delete {count}
        </button>
      </div>
    </div>
  );
}

function MoveToFolderPicker({
  folders,
  currentFolder,
  onCancel,
  onPick,
}: {
  folders: FolderRow[];
  currentFolder: string;
  onCancel: () => void;
  onPick: (path: string) => void;
}) {
  // All distinct paths, including root, sorted lexicographically. Caller hides
  // the picker and awaits the move.
  const paths = useMemo(() => {
    const set = new Set<string>(["/"]);
    for (const f of folders) set.add(f.path);
    return Array.from(set).sort();
  }, [folders]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex max-h-[60vh] w-full max-w-md flex-col overflow-hidden rounded border border-border bg-bg-1 shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h3 className="text-sm font-semibold text-text-0">Move to folder</h3>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {paths.map((p) => (
            <li key={p}>
              <button
                onClick={() => onPick(p)}
                disabled={p === currentFolder}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bg-2",
                  p === currentFolder && "cursor-not-allowed opacity-50",
                )}
              >
                <FolderIcon className="h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden="true" />
                <span className="font-mono text-text-1">{p}</span>
                {p === currentFolder ? (
                  <span className="ml-auto text-[10px] uppercase text-text-3">current</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Rows                                                                       */
/* ------------------------------------------------------------------------- */

function FolderItem({
  folder,
  renaming,
  isDropTarget,
  onOpen,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onDuplicate,
  onDelete,
  onDragEnter,
  onDragLeave,
  onDropFile,
}: {
  folder: FolderRow;
  renaming: boolean;
  isDropTarget: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onSubmitRename: (name: string) => void;
  onCancelRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDropFile: () => void;
}) {
  const [draft, setDraft] = useState(folder.name);
  useEffect(() => setDraft(folder.name), [folder.name, renaming]);

  if (renaming) {
    return (
      <li className="flex items-center gap-3 bg-bg-2 px-4 py-2.5">
        <FolderIcon className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isValidFolderName(draft.trim())) {
              onSubmitRename(draft.trim());
            } else if (e.key === "Escape") {
              onCancelRename();
            }
          }}
          onBlur={onCancelRename}
          className="flex-1 bg-transparent text-sm text-text-0 outline-none"
        />
      </li>
    );
  }

  return (
    <li
      onDoubleClick={onOpen}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("application/x-rokki-file")) {
          e.preventDefault();
          onDragEnter();
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-rokki-file")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropFile();
      }}
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 hover:bg-bg-2",
        isDropTarget && "bg-accent-subtle",
      )}
    >
      <FolderIcon className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
      <button
        onClick={onOpen}
        className="flex-1 truncate text-left text-sm text-text-0"
        title={folder.path}
      >
        {folder.name}
      </button>
      <button
        onClick={onStartRename}
        aria-label="Rename"
        title="Rename"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0 group-hover:flex"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        onClick={onDuplicate}
        aria-label="Duplicate folder"
        title="Duplicate folder (copies all contents)"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0 group-hover:flex"
      >
        <CopyIcon className="h-3 w-3" />
      </button>
      <button
        onClick={onDelete}
        aria-label="Delete folder"
        title="Delete folder"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-danger group-hover:flex"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}

function FileItem({
  file,
  ticker,
  renaming,
  currentFolder,
  selected,
  onSelect,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onDuplicate,
  onDelete,
  onEditPermissions,
  onDragStart,
  onDragEnd,
}: {
  file: FileRow;
  ticker: string;
  renaming: boolean;
  currentFolder: string;
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onStartRename: () => void;
  onSubmitRename: (name: string) => void;
  onCancelRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEditPermissions: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [draft, setDraft] = useState(file.filename);
  useEffect(() => setDraft(file.filename), [file.filename, renaming]);
  void currentFolder; // reserved for future "paste here" context

  if (renaming) {
    return (
      <li className="flex items-center gap-3 bg-bg-2 px-4 py-2.5">
        <FileText
          className="h-4 w-4 flex-shrink-0 text-text-3"
          aria-hidden="true"
        />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onSubmitRename(draft.trim());
            } else if (e.key === "Escape") {
              onCancelRename();
            }
          }}
          onBlur={onCancelRename}
          className="flex-1 bg-transparent text-sm text-text-0 outline-none"
        />
      </li>
    );
  }

  return (
    <li
      draggable
      onDragStart={(e) => {
        // Use a custom mime so external file drops don't collide with row drags
        e.dataTransfer.setData("application/x-rokki-file", file.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 hover:bg-bg-2",
        selected && "bg-accent-subtle/40 hover:bg-accent-subtle/50",
      )}
    >
      <FileThumb file={file} />
      {file.mime_type === "application/pdf" ? (
        <a
          href={`/p/${ticker}/drawings/${file.id}`}
          className="flex-1 truncate text-sm text-text-0 hover:text-accent hover:underline"
          title={`Open ${file.filename}`}
          onClick={(e) => e.stopPropagation()}
        >
          {file.filename}
        </a>
      ) : (
        <span
          className="flex-1 truncate text-sm text-text-0"
          title={file.filename}
        >
          {file.filename}
        </span>
      )}
      <span className="font-mono text-xs text-text-3">
        {formatSize(file.size_bytes)}
      </span>
      {file.virus_scan_status === "pending" ? (
        <span
          className="rounded-sm border border-warning/40 bg-warning-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase text-warning"
          title="File is being scanned"
        >
          Scanning…
        </span>
      ) : file.virus_scan_status === "infected" ? (
        <span
          className="rounded-sm border border-danger/40 bg-danger-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase text-danger"
          title="Virus scan flagged this file"
        >
          Infected
        </span>
      ) : null}
      {file.virus_scan_status === "infected" ? (
        <span
          className="items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-text-3"
          aria-label="Download disabled — file is infected"
          title="Download disabled — file is infected"
        />
      ) : (
        <a
          href={`/api/v1/files/${file.id}/download`}
          className="hidden items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0 group-hover:flex"
          aria-label="Download"
          title="Download"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="h-3 w-3" />
        </a>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStartRename();
        }}
        aria-label="Rename"
        title="Rename"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0 group-hover:flex"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEditPermissions();
        }}
        aria-label="Permissions"
        title={visibilityLabel(file.visibility)}
        className="hidden items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0 group-hover:flex"
      >
        {file.visibility === "custom" ? (
          <UserCheck className="h-3 w-3" />
        ) : file.visibility === "owners" ? (
          <Lock className="h-3 w-3" />
        ) : (
          <UsersIcon className="h-3 w-3" />
        )}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate();
        }}
        aria-label="Duplicate"
        title="Duplicate"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0 group-hover:flex"
      >
        <CopyIcon className="h-3 w-3" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Move to trash"
        title="Move to trash"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-danger group-hover:flex"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}

/**
 * Inline thumbnail. For previewable images we hit /signed-url to get a short
 * presigned blob URL and render the bitmap; everything else falls back to the
 * existing icon. We only fetch when the file is "clean" — pending/infected
 * files reuse the icon to avoid surfacing unscanned content.
 */
function FileThumb({ file }: { file: FileRow }) {
  const isImage =
    file.mime_type.startsWith(IMAGE_MIME_PREFIX) &&
    PREVIEWABLE_IMAGE_MIMES.has(file.mime_type);
  const safeForPreview =
    file.virus_scan_status === "clean" || file.virus_scan_status === "skipped";
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage || !safeForPreview) return;
    let cancelled = false;
    void fetch(`/api/v1/files/${file.id}/signed-url`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ data?: { url: string } }>) : null))
      .then((body) => {
        if (cancelled) return;
        if (body?.data?.url) setUrl(body.data.url);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file.id, isImage, safeForPreview]);

  if (isImage && safeForPreview && url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-8 w-8 flex-shrink-0 rounded-sm border border-border object-cover"
      />
    );
  }
  if (isImage) {
    return (
      <ImageIcon
        className="h-4 w-4 flex-shrink-0 text-text-3"
        aria-hidden="true"
      />
    );
  }
  return (
    <FileText className="h-4 w-4 flex-shrink-0 text-text-3" aria-hidden="true" />
  );
}

function TrashItem({
  file,
  onRestore,
  onPermanent,
}: {
  file: FileRow;
  onRestore: () => void;
  onPermanent: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 px-4 py-2.5">
      <FileText className="h-4 w-4 flex-shrink-0 text-text-3" aria-hidden="true" />
      <span
        className="flex-1 truncate text-sm text-text-2 line-through"
        title={file.filename}
      >
        {file.filename}
      </span>
      <span className="font-mono text-xs text-text-3">
        {formatSize(file.size_bytes)}
      </span>
      <button
        onClick={onRestore}
        aria-label="Restore"
        title="Restore"
        className="hidden items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0 group-hover:flex"
      >
        <RotateCcw className="h-3 w-3" />
      </button>
      <button
        onClick={onPermanent}
        aria-label="Delete permanently"
        title="Delete permanently"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-danger group-hover:flex"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}

function NewFolderInline({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex items-center gap-3 border-b border-border bg-bg-1 px-4 py-2.5">
      <FolderIcon className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
      <input
        autoFocus
        placeholder="New folder name… Enter to save, Esc to cancel"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && isValidFolderName(draft.trim())) {
            onSubmit(draft.trim());
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
      />
    </div>
  );
}

function EmptyFolder({
  onUpload,
  onNewFolder,
  atRoot,
}: {
  onUpload: () => void;
  onNewFolder: () => void;
  atRoot: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <p className="text-sm text-text-2">
        {atRoot ? "No files yet." : "This folder is empty."}
      </p>
      <p className="text-xs text-text-3">Drop files here, or use the buttons below.</p>
      <div className="flex gap-2">
        <button
          onClick={onUpload}
          className="rounded border border-border bg-bg-2 px-3 py-1.5 text-sm text-text-1 hover:bg-bg-3"
        >
          Upload
        </button>
        <button
          onClick={onNewFolder}
          className="rounded border border-border bg-bg-2 px-3 py-1.5 text-sm text-text-1 hover:bg-bg-3"
        >
          New folder
        </button>
      </div>
    </div>
  );
}

function EmptyTrash() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-sm text-text-2">Trash is empty.</p>
      <p className="text-xs text-text-3">
        Deleted files and folders land here, recoverable until you remove them for good.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <span className="h-4 w-4 rounded-sm bg-bg-3" />
          <span className="h-3 flex-1 rounded-sm bg-bg-3" />
          <span className="h-3 w-12 rounded-sm bg-bg-3" />
        </li>
      ))}
    </ul>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
