import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCellNoteAutosave } from "../useCellNoteAutosave";

describe("useCellNoteAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounce agrupa pulsaciones en una sola llamada", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useCellNoteAutosave({
        rowId: "r1",
        weekStart: "2026-08-03",
        initial: "",
        save,
      }),
    );

    act(() => {
      result.current.setDraft("a");
      result.current.setDraft("ab");
      result.current.setDraft("abc");
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("r1", "2026-08-03", "abc");
  });

  it("no emite si el contenido no cambió", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useCellNoteAutosave({
        rowId: "r1",
        weekStart: "2026-08-03",
        initial: "hola",
        save,
      }),
    );

    act(() => {
      result.current.setDraft("hola");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("flush fuerza la llamada pendiente", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useCellNoteAutosave({
        rowId: "r1",
        weekStart: "2026-08-03",
        initial: "",
        save,
      }),
    );

    act(() => {
      result.current.setDraft("nota");
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("r1", "2026-08-03", "nota");
  });

  it("error deja state=error y conserva el borrador", async () => {
    const save = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      useCellNoteAutosave({
        rowId: "r1",
        weekStart: "2026-08-03",
        initial: "",
        save,
      }),
    );

    act(() => {
      result.current.setDraft("fallo");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(result.current.state).toBe("error");
    expect(result.current.draft).toBe("fallo");
  });

  it("desmontaje hace flush", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { result, unmount } = renderHook(() =>
      useCellNoteAutosave({
        rowId: "r1",
        weekStart: "2026-08-03",
        initial: "",
        save,
      }),
    );

    act(() => {
      result.current.setDraft("persistir");
    });
    unmount();
    expect(save).toHaveBeenCalledWith("r1", "2026-08-03", "persistir");
  });
});
