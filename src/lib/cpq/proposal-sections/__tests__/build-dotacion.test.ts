import { describe, expect, it } from "vitest";
import { buildDotacionContent } from "../build-dotacion";

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
  });
});
