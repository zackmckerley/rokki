"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
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
import { EmptyState } from "./EmptyState";

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

export function FilesPane({ ticker, projectId }: FilesPaneProps) {
  const [view, setView] = useState<View>("live");
  const [currentFolder, setCurrentFolder] = useState("/");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
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
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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
        icon: <Upload className="h-3.5 w-3.5" />,
        onRun: () => inputRef.current?.click(),
      },
      {
        id: `files/camera:${projectId}`,
        title: "Take photo and upload",
        subtitle: currentFolder,
        category: "action" as const,
        icon: <Upload className="h-3.5 w-3.5" />,
        onRun: () => cameraRef.current?.click(),
      },
      {
        id: `files/new-folder:${projectId}`,
        title: "New folder",
        subtitle: currentFolder,
        category: "action" as const,
        icon: <FolderPlus className="h-3.5 w-3.5" />,
        onRun: () => setNewFolderOpen(true),
      },
      {
        id: `files/trash:${projectId}`,
        title: view === "trash" ? "Exit trash" : "Show trash",
        category: "action" as const,
        icon: <Trash2 className="h-3.5 w-3.5" />,
        onRun: () => setView(view === "trash" ? "live" : "trash"),
      },
    ],
    [projectId, currentFolder, view],
  );
  useRegisterCommands(`files:${projectId}`, paletteCommands);

  async function uploadFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      setError(`${file.name} exceeds 25 MB.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", currentFolder);
      const r = await fetch(`/api/v1/projects/${ticker}/files`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const body = (await r.json()) as { errors?: { message: string }[] };
      if (!r.ok) {
        setError(body.errors?.[0]?.message ?? "Upload failed");
        return;
      }
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function uploadMany(list: FileList | File[]) {
    for (const f of Array.from(list)) await uploadFile(f);
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

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={(e) => {
        if (isTrash) return;
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragOver={(e) => {
        if (isTrash) return;
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (isTrash) return;
        e.preventDefault();
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

      {uploading ? (
        <div className="border-b border-border bg-bg-2 px-4 py-2 text-xs text-text-2">
          Uploading…
        </div>
      ) : null}

      <div
        className={cn(
          "flex-1 overflow-y-auto transition-colors",
          dragging && !isTrash && "bg-accent-subtle",
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
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent-subtle/60 text-sm font-medium text-accent backdrop-blur-sm">
          Drop to upload into {currentFolder === "/" ? "Files" : currentFolder}
        </div>
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
        <FolderIcon className="h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden="true" />
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
      <FolderIcon className="h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden="true" />
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
          className="h-3.5 w-3.5 flex-shrink-0 text-text-3"
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
      className="group flex items-center gap-3 px-4 py-2.5 hover:bg-bg-2"
    >
      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-text-3" aria-hidden="true" />
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
        >
          <Download className="h-3 w-3" />
        </a>
      )}
      <button
        onClick={onStartRename}
        aria-label="Rename"
        title="Rename"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0 group-hover:flex"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        onClick={onEditPermissions}
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
        onClick={onDuplicate}
        aria-label="Duplicate"
        title="Duplicate"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-text-0 group-hover:flex"
      >
        <CopyIcon className="h-3 w-3" />
      </button>
      <button
        onClick={onDelete}
        aria-label="Move to trash"
        title="Move to trash"
        className="hidden rounded-sm px-1.5 py-0.5 text-xs text-text-2 hover:bg-bg-3 hover:text-danger group-hover:flex"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
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
      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-text-3" aria-hidden="true" />
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
      <FolderIcon className="h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden="true" />
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
    <EmptyState
      icon={FileText}
      title={atRoot ? "No files yet." : "This folder is empty."}
      body="Drag files here, or use the buttons below. Up to 25 MB per file."
      action={{ label: "Upload", onClick: onUpload, variant: "accent" }}
      secondaryAction={{ label: "New folder", onClick: onNewFolder }}
      className="p-10"
    />
  );
}

function EmptyTrash() {
  return (
    <EmptyState
      icon={Trash2}
      title="Trash is empty."
      body="Deleted files and folders land here, recoverable until you remove them for good."
      className="p-10"
    />
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
