import { describe, expect, it } from "vitest";
import {
  buildDotacionContent,
  countDotacionGuards,
  hasRealDotacion,
  isEmptyDotacionContent,
} from "../build-dotacion";

describe("buildDotacionContent", () => {
  it("explica que falta costeo cuando no hay puestos", () => {
    expect(buildDotacionContent([])).toBe(
      "Sin puestos cotizados; completar cuando exista costeo.",
    );
  });

  it("construye una tabla legible con cargo, guardias y cobertura", () => {
    const content = buildDotacionContent([
      {
        customName: "Acceso principal",
        puestoTrabajo: { name: "Control de acceso" },
        cargo: { name: "Guardia de seguridad" },
        rol: { name: "Turno día" },
        weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie"],
        startTime: "08:00",
        endTime: "20:00",
        numGuards: 2,
        numPuestos: 1,
      },
    ]);

    expect(content).toContain("| Puesto | Cargo | Cobertura | Guardias | Puestos |");
    expect(content).toContain(
      "| Acceso principal | Guardia de seguridad | Lun-Vie · 08:00–20:00 | 2 | 1 |",
    );
    expect(content).toContain("**Dotación total:** 2 guardias en 1 turno(s).");
  });

  it("agrupa por servicio (serviceGroup) con totales por turno", () => {
    const content = buildDotacionContent([
      {
        customName: "Administrativo día",
        puestoTrabajo: { name: "Administrativo" },
        cargo: { name: "Guardia" },
        weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
        startTime: "08:00",
        endTime: "20:00",
        numGuards: 2,
        numPuestos: 1,
        serviceGroup: { name: "24/7 continuo", displayOrder: 0 },
      },
      {
        customName: "Administrativo noche",
        puestoTrabajo: { name: "Administrativo" },
        cargo: { name: "Guardia" },
        weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
        startTime: "20:00",
        endTime: "08:00",
        numGuards: 2,
        numPuestos: 1,
        serviceGroup: { name: "24/7 continuo", displayOrder: 0 },
      },
    ]);

    expect(content).toContain("### 24/7 continuo");
    expect(content).toContain("Turnos: 2 · Dotación: 4 guardias");
    expect(content).toContain("Administrativo día");
    expect(content).toContain("Administrativo noche");
    expect(content).toContain("**Dotación total:** 4 guardias en 2 turno(s).");
  });

  it("detecta contenido vacío / nota de sin puestos", () => {
    expect(isEmptyDotacionContent("")).toBe(true);
    expect(isEmptyDotacionContent("Sin puestos cotizados; completar cuando exista costeo.")).toBe(
      true,
    );
    expect(isEmptyDotacionContent("### 24/7 continuo\n\nTurnos: 2")).toBe(false);
  });

  it("cuenta guardias reales como el costeo", () => {
    const positions = [
      { weekdays: [], startTime: "08:00", endTime: "20:00", numGuards: 2, numPuestos: 2 },
    ];
    expect(countDotacionGuards(positions)).toBe(4);
    expect(hasRealDotacion(positions)).toBe(true);
    expect(hasRealDotacion([])).toBe(false);
  });
});
