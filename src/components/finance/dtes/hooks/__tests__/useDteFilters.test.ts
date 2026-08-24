import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDteFilters } from "../useDteFilters";
import {
  DEFAULT_ISSUED_DTE_TYPES,
  isDefaultIssuedDteTypes,
} from "../../shared/types";

describe("useDteFilters", () => {
  it("inicia con Factura electrónica (33) como único tipo marcado", () => {
    const { result } = renderHook(() => useDteFilters());
    expect(result.current.filters.types).toEqual(DEFAULT_ISSUED_DTE_TYPES);
    expect(isDefaultIssuedDteTypes(result.current.filters.types)).toBe(true);
    expect(result.current.activeCount).toBe(0);
  });

  it("permite marcar y desmarcar tipos (uno, varios o ninguno)", () => {
    const { result } = renderHook(() => useDteFilters());

    act(() => {
      result.current.toggleType(61);
    });
    expect(result.current.filters.types).toEqual([33, 61]);
    expect(result.current.activeCount).toBe(0);

    act(() => {
      result.current.toggleType(33);
    });
    expect(result.current.filters.types).toEqual([61]);

    act(() => {
      result.current.toggleType(61);
    });
    expect(result.current.filters.types).toEqual([]);
  });

  it("reset vuelve a Factura electrónica", () => {
    const { result } = renderHook(() => useDteFilters());

    act(() => {
      result.current.toggleType(33);
      result.current.toggleType(34);
    });
    expect(result.current.filters.types).toEqual([34]);

    act(() => {
      result.current.reset();
    });
    expect(result.current.filters.types).toEqual([33]);
  });
});
