/**
 * Cross-pane drag-and-drop primitives for the terminal UI.
 *
 * Why custom MIME types: HTML5's dataTransfer is a flat KV store. Using
 * specific MIME-like keys (application/x-rokki-*) lets a drop target
 * sniff dataTransfer.types and only opt-in to drops it can handle —
 * a TasksPane row will accept a file or a member, but ignore another
 * task being dragged onto it from outside its merge handler.
 *
 * `text/plain` is also set as a polyfill payload so the browser shows
 * a sensible drag image and so that dragging into an external surface
 * (chat, editor) drops a readable hint instead of an empty string.
 *
 * NOT covered here: file uploads from the OS. Those use the native
 * "Files" type and are handled directly in FilesPane.
 */

export const DRAG_MIME_FILE = "application/x-rokki-file-id";
export const DRAG_MIME_TASK = "application/x-rokki-task-id";
export const DRAG_MIME_USER = "application/x-rokki-user-id";

export type RokkiDragKind = "file" | "task" | "user";

const MIME_BY_KIND: Record<RokkiDragKind, string> = {
  file: DRAG_MIME_FILE,
  task: DRAG_MIME_TASK,
  user: DRAG_MIME_USER,
};

/**
 * Stamps the right MIME on a dataTransfer for a drag of the given kind.
 * Use inside an `onDragStart`. The plain-text payload is the entity id
 * itself — short, readable, and what an external drop receives.
 *
 * Also publishes the kind to the global tracker so dragover-time UI can
 * decide what affordance to show without inspecting the (unreadable
 * during dragover) dataTransfer payload.
 */
export function setDragPayload(
  dt: DataTransfer,
  kind: RokkiDragKind,
  id: string,
  label?: string,
): void {
  dt.setData(MIME_BY_KIND[kind], id);
  dt.setData("text/plain", label ?? id);
  dt.effectAllowed = kind === "user" ? "link" : "move";
  setActiveDragKind(kind);
}

/**
 * Read an id back from a drop payload. Returns null when the dataTransfer
 * doesn't carry the expected MIME (so callers can short-circuit).
 *
 * Note: dataTransfer.getData() during `onDragOver` returns "" in most
 * browsers (security model — no payload until drop). Use `hasDragKind`
 * for dragover acceptance, this for the actual drop handler.
 */
export function getDragPayload(
  dt: DataTransfer,
  kind: RokkiDragKind,
): string | null {
  const value = dt.getData(MIME_BY_KIND[kind]);
  return value || null;
}

/**
 * Check whether a drag carries our payload type — safe to call from
 * `onDragEnter` / `onDragOver`. We sniff the `types` array (which IS
 * available during the drag, unlike `getData()`).
 */
export function hasDragKind(dt: DataTransfer, kind: RokkiDragKind): boolean {
  return dt.types.includes(MIME_BY_KIND[kind]);
}

/**
 * True when the drag is one of OUR kinds (any). Useful for "show drop
 * affordance" checks where the row accepts more than one kind.
 */
export function hasAnyRokkiDrag(dt: DataTransfer): boolean {
  return (
    dt.types.includes(DRAG_MIME_FILE) ||
    dt.types.includes(DRAG_MIME_TASK) ||
    dt.types.includes(DRAG_MIME_USER)
  );
}

/**
 * Document-level tracker of the currently-active Rokki drag. The browser
 * doesn't let you read `dataTransfer.getData()` outside of `drop`, but
 * `setDragPayload` can mirror the kind into a singleton so dragover-time
 * UI (captions, hover highlights) can decide what to render.
 *
 * Cleared on dragend. The setter is exported so tests can drive it.
 */
let _activeDragKind: RokkiDragKind | null = null;
const _kindListeners = new Set<(kind: RokkiDragKind | null) => void>();

function notifyKindListeners() {
  for (const cb of _kindListeners) cb(_activeDragKind);
}

export function setActiveDragKind(kind: RokkiDragKind | null): void {
  _activeDragKind = kind;
  notifyKindListeners();
}

export function getActiveDragKind(): RokkiDragKind | null {
  return _activeDragKind;
}

export function subscribeActiveDragKind(
  cb: (kind: RokkiDragKind | null) => void,
): () => void {
  _kindListeners.add(cb);
  return () => {
    _kindListeners.delete(cb);
  };
}

// Auto-clear on any global dragend. Multiple drags-in-flight are
// impossible (the browser only allows one at a time), so a single
// listener is correct.
if (typeof window !== "undefined") {
  window.addEventListener("dragend", () => setActiveDragKind(null));
  window.addEventListener("drop", () => {
    // setTimeout 0 — let drop handlers read getData() first; clearing
    // the kind doesn't affect dataTransfer, but resetting in a
    // microtask matches the user-visible end of the drag.
    setTimeout(() => setActiveDragKind(null), 0);
  });
}
