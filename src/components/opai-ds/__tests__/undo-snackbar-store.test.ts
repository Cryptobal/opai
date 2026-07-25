import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetUndoSnackbarForTests,
  dismissUndo,
  getUndoSnackbarSnapshot,
  showUndo,
  subscribeUndoSnackbar,
} from "../undo-snackbar-store";

afterEach(() => {
  __resetUndoSnackbarForTests();
});

describe("undo-snackbar-store", () => {
  it("showUndo publica el estado y notifica listeners", () => {
    const listener = vi.fn();
    const unsub = subscribeUndoSnackbar(listener);
    const id = showUndo({
      message: "Movido a la Papelera",
      onUndo: () => undefined,
    });
    expect(id).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalled();
    const snap = getUndoSnackbarSnapshot();
    expect(snap?.message).toBe("Movido a la Papelera");
    expect(snap?.actionLabel).toBe("Deshacer");
    expect(snap?.durationMs).toBe(10_000);
    unsub();
  });

  it("reemplaza el snackbar anterior y llama onExpire del previo", () => {
    const onExpire = vi.fn();
    showUndo({ message: "Primero", onUndo: () => undefined, onExpire });
    showUndo({ message: "Segundo", onUndo: () => undefined, durationMs: 5_000 });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(getUndoSnackbarSnapshot()?.message).toBe("Segundo");
    expect(getUndoSnackbarSnapshot()?.durationMs).toBe(5_000);
  });

  it("dismissUndo limpia y respeta id", () => {
    const onExpire = vi.fn();
    const id = showUndo({
      message: "Archivado",
      onUndo: () => undefined,
      onExpire,
    });
    dismissUndo(id + 1);
    expect(getUndoSnackbarSnapshot()).not.toBeNull();
    dismissUndo(id);
    expect(getUndoSnackbarSnapshot()).toBeNull();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("dismissUndo silent no dispara onExpire", () => {
    const onExpire = vi.fn();
    const id = showUndo({
      message: "Enviando…",
      onUndo: () => undefined,
      onExpire,
    });
    dismissUndo(id, { silent: true });
    expect(onExpire).not.toHaveBeenCalled();
  });
});
