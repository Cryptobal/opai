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

/**
 * Claim del host: mientras un lector (p. ej. la isla móvil de Correos) está
 * montado, "reclama" el host del undo para renderizar el estado dentro de sí
 * mismo. `UndoSnackbarHost` global no renderiza mientras haya un claim activo.
 * Se cuenta con un contador para soportar claims simultáneos sin apagar el host
 * global antes de tiempo. Aditivo: sin nadie que reclame, nada cambia.
 */
let hostClaims = 0;
const hostClaimListeners = new Set<Listener>();

function emitHostClaim() {
  for (const listener of hostClaimListeners) listener();
}

export function getUndoHostClaimSnapshot(): boolean {
  return hostClaims > 0;
}

export function subscribeUndoHostClaim(listener: Listener): () => void {
  hostClaimListeners.add(listener);
  return () => hostClaimListeners.delete(listener);
}

/** Reclama el host del undo (el caller lo renderiza). Devuelve la liberación. */
export function claimUndoHost(): () => void {
  hostClaims += 1;
  emitHostClaim();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hostClaims = Math.max(0, hostClaims - 1);
    emitHostClaim();
  };
}

/** @internal tests */
export function __resetUndoSnackbarForTests(): void {
  state = null;
  seq = 0;
  hostClaims = 0;
  emit();
  emitHostClaim();
}
