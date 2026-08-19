import { describe, expect, it } from "vitest";
import {
  shouldOpenPinnedDetailOnContextMenu,
  shouldSelectCellOnContextMenu,
} from "../useCellHover";

describe("shouldOpenPinnedDetailOnContextMenu", () => {
  it("abre con clic derecho en desktop, aunque la celda no esté seleccionada", () => {
    expect(shouldOpenPinnedDetailOnContextMenu(true)).toBe(true);
  });

  it("no abre en touch / viewport estrecho", () => {
    expect(shouldOpenPinnedDetailOnContextMenu(false)).toBe(false);
  });
});

describe("shouldSelectCellOnContextMenu", () => {
  it("selecciona si la celda no está en la selección (como Sheets)", () => {
    expect(shouldSelectCellOnContextMenu(false)).toBe(true);
  });

  it("no re-selecciona si ya está en el rango o es la celda activa", () => {
    expect(shouldSelectCellOnContextMenu(true)).toBe(false);
  });
});
