import { describe, expect, it } from "vitest";
import {
  dotacionToPosition,
  type DotacionForPosition,
} from "@/lib/crm/lead-dotacion-to-position";

describe("dotacionToPosition", () => {
  it("conserva todos los campos de un puesto creado desde el correo", () => {
    const dotacion: DotacionForPosition = {
      puestoTrabajoId: "puesto-1",
      puesto: "Control de Acceso",
      customName: "Control de acceso día",
      cargoId: "cargo-1",
      rolId: "rol-1",
      baseSalary: 620000,
      shiftType: "day",
      cantidad: 2,
      numPuestos: 3,
      horaInicio: "08:00",
      horaFin: "20:00",
      dias: ["lunes", "martes", "miercoles"],
      description: "Funciones: rondas y control vehicular.",
      serviceGroupKey: "grp-1",
      serviceGroupName: "Turno diurno",
      serviceGroupPattern: "12-7-dia",
      serviceGroupOrder: 1,
      serviceGroupIcon: "sun",
    };

    const pos = dotacionToPosition(dotacion);

    expect(pos).toEqual({
      puestoTrabajoId: "puesto-1",
      puesto: "Control de Acceso",
      customName: "Control de acceso día",
      description: "Funciones: rondas y control vehicular.",
      cargoId: "cargo-1",
      rolId: "rol-1",
      baseSalary: 620000,
      shiftType: "day",
      cantidad: 2,
      numPuestos: 3,
      horaInicio: "08:00",
      horaFin: "20:00",
      dias: ["lunes", "martes", "miercoles"],
      serviceGroupKey: "grp-1",
      serviceGroupName: "Turno diurno",
      serviceGroupPattern: "12-7-dia",
      serviceGroupOrder: 1,
      serviceGroupIcon: "sun",
    });
  });

  it("normaliza description ausente a null y clona el arreglo de días", () => {
    const dias = ["sabado", "domingo"];
    const dotacion: DotacionForPosition = {
      puesto: "Guardia",
      cantidad: 1,
      horaInicio: "20:00",
      horaFin: "08:00",
      dias,
    };

    const pos = dotacionToPosition(dotacion);

    expect(pos.description).toBeNull();
    // El arreglo de días debe ser una copia, no la misma referencia (evita mutaciones cruzadas).
    expect(pos.dias).toEqual(["sabado", "domingo"]);
    expect(pos.dias).not.toBe(dias);
  });
});
