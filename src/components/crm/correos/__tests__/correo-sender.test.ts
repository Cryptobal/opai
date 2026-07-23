import { describe, expect, it } from "vitest";
import {
  parseSender,
  senderColorIndex,
  SENDER_PALETTE_SIZE,
} from "../correo-sender";

describe("parseSender", () => {
  it("parsea nombre entre comillas + email", () => {
    expect(parseSender('"Nombre Apellido" <a@b.cl>')).toEqual({
      name: "Nombre Apellido",
      email: "a@b.cl",
      initials: "NA",
    });
  });

  it("parsea nombre sin comillas + email", () => {
    expect(parseSender("Nombre <a@b.cl>")).toEqual({
      name: "Nombre",
      email: "a@b.cl",
      initials: "N",
    });
  });

  it("parsea email pelado (nombre = parte local)", () => {
    expect(parseSender("carlos.irigoyen@gard.cl")).toEqual({
      name: "carlos.irigoyen",
      email: "carlos.irigoyen@gard.cl",
      initials: "C",
    });
  });

  it("null o vacío → placeholder", () => {
    expect(parseSender(null)).toEqual({ name: "", email: "", initials: "?" });
    expect(parseSender("   ")).toEqual({ name: "", email: "", initials: "?" });
  });

  it('soporta "Apellido, Nombre" <x@y>', () => {
    expect(parseSender('"Apellido, Nombre" <x@y>')).toEqual({
      name: "Apellido, Nombre",
      email: "x@y",
      initials: "AN",
    });
  });

  it("conserva acentos en iniciales", () => {
    expect(parseSender('"Álvaro Pérez" <ap@z.cl>').initials).toBe("ÁP");
  });
});

describe("senderColorIndex", () => {
  it("es estable e insensible a mayúsculas", () => {
    expect(senderColorIndex("A@B.cl")).toBe(senderColorIndex("a@b.CL"));
    expect(senderColorIndex(" a@b.cl ")).toBe(senderColorIndex("a@b.cl"));
  });

  it("siempre cae dentro de la paleta", () => {
    for (const email of ["a@b.cl", "x@y", "", "larguisimo.correo+tag@dominio.com"]) {
      const index = senderColorIndex(email);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(SENDER_PALETTE_SIZE);
    }
  });
});
