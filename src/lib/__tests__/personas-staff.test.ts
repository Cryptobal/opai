import { describe, expect, it } from "vitest";
import {
  isPersonaLaborClass,
  isStaffCargo,
  laborClassIsCost,
  laborClassLabel,
  namesLikelySame,
  staffCargoFromAdminCargo,
  staffCargoLabel,
  splitPersonName,
} from "../personas-staff";

describe("personas-staff", () => {
  it("reconoce clases económicas", () => {
    expect(isPersonaLaborClass("OPERATIVO")).toBe(true);
    expect(isPersonaLaborClass("ADMINISTRATIVO")).toBe(true);
    expect(isPersonaLaborClass("GUARDIA")).toBe(false);
  });

  it("OPERATIVO es costo y ADMINISTRATIVO no", () => {
    expect(laborClassIsCost("OPERATIVO")).toBe(true);
    expect(laborClassIsCost("ADMINISTRATIVO")).toBe(false);
  });

  it("etiqueta cargos internos", () => {
    expect(isStaffCargo("gerente")).toBe(true);
    expect(staffCargoLabel("supervisor")).toBe("Supervisor");
    expect(staffCargoLabel(null)).toBe("Sin cargo");
  });

  it("parte el nombre de un Admin", () => {
    expect(splitPersonName("María Soto")).toEqual({ firstName: "María", lastName: "Soto" });
    expect(splitPersonName("Ana")).toEqual({ firstName: "Ana", lastName: "" });
  });

  it("mapea cargo libre de Admin", () => {
    expect(staffCargoFromAdminCargo("Gerente General")).toBe("gerente");
    expect(staffCargoFromAdminCargo("supervisor")).toBe("supervisor");
    expect(staffCargoFromAdminCargo(null)).toBeNull();
  });

  it("etiqueta clase laboral", () => {
    expect(laborClassLabel("OPERATIVO")).toBe("Guardia");
    expect(laborClassLabel("ADMINISTRATIVO")).toBe("Administrativo");
    expect(laborClassLabel(null)).toBe("Guardia");
  });

  it("reconoce el mismo nombre con segundo nombre extra", () => {
    expect(
      namesLikelySame(
        { firstName: "Carlos", lastName: "Irigoyen" },
        { firstName: "Carlos Cristobal", lastName: "Irigoyen" },
      ),
    ).toBe(true);
    expect(
      namesLikelySame(
        { firstName: "Carlos", lastName: "Irigoyen" },
        { firstName: "Pedro", lastName: "Irigoyen" },
      ),
    ).toBe(false);
  });
});
