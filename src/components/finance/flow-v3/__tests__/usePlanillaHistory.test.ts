import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePlanillaHistory, type HistoryEntry } from "../usePlanillaHistory";

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    label: "x",
    focus: null,
    undo: vi.fn(async () => {}),
    redo: vi.fn(async () => {}),
    ...over,
  };
}

describe("usePlanillaHistory", () => {
  it("undo ejecuta el inverso de la última entrada; redo lo reaplica", async () => {
    const { result } = renderHook(() => usePlanillaHistory());
    const e = entry();
    act(() => result.current.push(e));

    await act(async () => {
      const r = await result.current.undo();
      expect(r).toBe(e);
    });
    expect(e.undo).toHaveBeenCalledOnce();

    await act(async () => {
      const r = await result.current.redo();
      expect(r).toBe(e);
    });
    expect(e.redo).toHaveBeenCalledOnce();
  });

  it("undo con pila vacía devuelve null sin efecto", async () => {
    const { result } = renderHook(() => usePlanillaHistory());
    await act(async () => {
      expect(await result.current.undo()).toBeNull();
      expect(await result.current.redo()).toBeNull();
    });
  });

  it("push nuevo limpia la pila de rehacer", async () => {
    const { result } = renderHook(() => usePlanillaHistory());
    const a = entry();
    act(() => result.current.push(a));
    await act(async () => { await result.current.undo(); }); // a → redo disponible
    const b = entry();
    act(() => result.current.push(b)); // limpia redo
    await act(async () => {
      expect(await result.current.redo()).toBeNull();
    });
  });

  it("tope de 50 entradas: descarta las más antiguas", async () => {
    const { result } = renderHook(() => usePlanillaHistory());
    act(() => {
      for (let i = 0; i < 60; i++) result.current.push(entry({ label: `e${i}` }));
    });
    let ok = 0;
    await act(async () => {
      for (let i = 0; i < 55; i++) if (await result.current.undo()) ok++;
    });
    expect(ok).toBe(50);
  });

  it("clear vacía deshacer y rehacer", async () => {
    const { result } = renderHook(() => usePlanillaHistory());
    act(() => result.current.push(entry()));
    act(() => result.current.clear());
    await act(async () => {
      expect(await result.current.undo()).toBeNull();
    });
  });
});
