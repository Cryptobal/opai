import { describe, expect, it } from "vitest";
import {
  DT_REPORT_MENU,
  DT_SIGLAS,
  DT_SIGLAS_GLOSSARY,
  EMPTY_INCIDENTES_MESSAGE,
  EMPTY_SELECTION_MESSAGE,
  NO_SHIFT_CHANGES_MESSAGE,
  NO_SUNDAY_HOLIDAY_MESSAGE,
} from "../constants";

describe("textos normados Res. Ex. N°38", () => {
  it("usa el mensaje literal del Art. 28 f", () => {
    expect(EMPTY_SELECTION_MESSAGE).toBe("No hay trabajadores que coincidan con la selección");
  });

  it("usa los mensajes de vacío de los Art. 27 c y 27 d", () => {
    expect(NO_SUNDAY_HOLIDAY_MESSAGE).toBe("La jornada de este trabajador no incluye domingos o festivos");
    expect(NO_SHIFT_CHANGES_MESSAGE).toBe("Sin cambios o modificaciones en el periodo consultado");
    expect(EMPTY_INCIDENTES_MESSAGE).toBe("No hay incidentes técnicos registrados");
  });

  it("incluye las siglas del Art. 28 g", () => {
    const codes = DT_SIGLAS.map((s) => s.code);
    expect(codes).toEqual(
      expect.arrayContaining(["A.I.", "A.J.", "AT", "C.T.", "D.E.J.", "H.E.", "J.O.", "L.M.", "VAC"]),
    );
    expect(DT_SIGLAS_GLOSSARY).toContain("H.E.: Horas extraordinarias");
  });

  it("expone el menú único con reportes a-f, clientes y hash", () => {
    expect(DT_REPORT_MENU.map((m) => m.tipo)).toEqual([
      "asistencia",
      "jornada-diaria",
      "domingos-festivos",
      "modificaciones-turnos",
      "reporte-diario",
      "incidentes",
      "clientes",
      "verificar-hash",
    ]);
  });
});
