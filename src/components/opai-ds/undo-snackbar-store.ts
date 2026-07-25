/**
 * Store imperativo del Undo snackbar global (estilo Gmail / Liquid Glass).
 * Uso: `showUndo({ message, onUndo })` desde cualquier Client Component.
 */

export const DEFAULT_UNDO_DURATION_MS = 10_000;

export type UndoSnackbarInput = {
  message: string;
  onUndo: () => void | Promise<void>;
  /** Texto del botón. Default: "Deshacer". */
  actionLabel?: string;
  /** Duración visible. Default: 10 s. */
  durationMs?: number;
  /** Se llama al expirar o al cerrar sin deshacer. */
  onExpire?: () => void;
};

export type UndoSnackbarState = {
  id: number;
  message: string;
  actionLabel: string;
  durationMs: number;
  onUndo: () => void | Promise<void>;
  onExpire?: () => void;
  createdAt: number;
};

type Listener = () => void;

let state: UndoSnackbarState | null = null;
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function getUndoSnackbarSnapshot(): UndoSnackbarState | null {
  return state;
}

export function subscribeUndoSnackbar(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Muestra (o reemplaza) el snackbar de deshacer. Devuelve el id. */
export function showUndo(input: UndoSnackbarInput): number {
  // Si había uno activo, notifica expiración del anterior (sin deshacer).
  const previous = state;
  if (previous?.onExpire) {
    try {
      previous.onExpire();
    } catch {
      /* ignore */
    }
  }
  const id = ++seq;
  state = {
    id,
    message: input.message,
    actionLabel: input.actionLabel ?? "Deshacer",
    durationMs: Math.max(input.durationMs ?? DEFAULT_UNDO_DURATION_MS, 1_000),
    onUndo: input.onUndo,
    onExpire: input.onExpire,
    createdAt: Date.now(),
  };
  emit();
  return id;
}

/** Cierra el snackbar. Si se pasa `id`, solo cierra si sigue siendo el activo. */
export function dismissUndo(id?: number, opts?: { silent?: boolean }): void {
  if (!state) return;
  if (id != null && state.id !== id) return;
  const expire = opts?.silent ? undefined : state.onExpire;
  state = null;
  emit();
  if (expire) {
    try {
      expire();
    } catch {
      /* ignore */
    }
  }
}

/** @internal tests */
export function __resetUndoSnackbarForTests(): void {
  state = null;
  seq = 0;
  emit();
}
