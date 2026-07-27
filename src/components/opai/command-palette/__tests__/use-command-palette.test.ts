/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCommandPaletteState } from "../use-command-palette";

describe("useCommandPaletteState open(initialQuery?)", () => {
  it("open() sin argumentos deja initialQuery indefinido", () => {
    const { result } = renderHook(() => useCommandPaletteState());
    act(() => {
      result.current.open();
    });
    expect(result.current.value.isOpen).toBe(true);
    expect(result.current.value.initialQuery).toBeUndefined();
  });

  it('open("x") expone initialQuery', () => {
    const { result } = renderHook(() => useCommandPaletteState());
    act(() => {
      result.current.open("x");
    });
    expect(result.current.value.isOpen).toBe(true);
    expect(result.current.value.initialQuery).toBe("x");
  });

  it("close() limpia initialQuery", () => {
    const { result } = renderHook(() => useCommandPaletteState());
    act(() => {
      result.current.open("hola");
    });
    act(() => {
      result.current.close();
    });
    expect(result.current.value.isOpen).toBe(false);
    expect(result.current.value.initialQuery).toBeUndefined();
  });
});
