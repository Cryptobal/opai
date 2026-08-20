import { describe, expect, it } from "vitest";
import {
  decideStaffMerge,
  emailsLikelySame,
  fichaMatchesLookup,
  rutKey,
  type FichaRow,
} from "../personas-staff-ficha";

function row(over: Partial<FichaRow> & Pick<FichaRow, "id">): FichaRow {
  return {
    firstName: "Carlos",
    lastName: "Irigoyen",
    rut: null,
    email: null,
    adminId: null,
    laborClass: "OPERATIVO",
    salaryStructureId: null,
    guardia: null,
    ...over,
  };
}

describe("personas-staff-ficha", () => {
  it("normaliza RUT para comparar", () => {
    expect(rutKey("13.255.838-8")).toBe(rutKey("13255838-8"));
  });

  it("compara emails sin mayúsculas", () => {
    expect(emailsLikelySame("Ops-QA@example.com", "ops-qa@example.com")).toBe(true);
    expect(emailsLikelySame("a@x.cl", "b@x.cl")).toBe(false);
  });

  it("matchea aunque el Admin parta mal nombre y apellido", () => {
    const guardia = row({
      id: "keep",
      firstName: "Carlos Cristobal",
      lastName: "Irigoyen",
      rut: "13255838-8",
      laborClass: "OPERATIVO",
      guardia: { id: "g1" },
    });
    expect(
      fichaMatchesLookup(guardia, {
        firstName: "Carlos",
        lastName: "Cristobal Irigoyen",
        adminId: "admin-1",
      }),
    ).toBe(true);
  });

  it("matchea ficha operativa por nombre aunque el staff no tenga RUT", () => {
    const guardia = row({
      id: "keep",
      firstName: "Carlos Cristobal",
      lastName: "Irigoyen",
      rut: "13255838-8",
      email: "carlos.operativo@example.com",
      laborClass: "OPERATIVO",
      guardia: { id: "g1" },
    });
    expect(
      fichaMatchesLookup(guardia, {
        firstName: "Carlos",
        lastName: "Irigoyen",
        email: "staff.orphan@example.com",
        adminId: "admin-1",
      }),
    ).toBe(true);
  });

  it("conserva la ficha con guardia y marca la staff huérfana", () => {
    const keep = row({
      id: "keep",
      rut: "13255838-8",
      laborClass: "OPERATIVO",
      guardia: { id: "g1" },
    });
    const orphan = row({
      id: "orphan",
      email: "staff.orphan@example.com",
      adminId: "admin-1",
      laborClass: "ADMINISTRATIVO",
      salaryStructureId: "sal-1",
      guardia: null,
    });
    const decision = decideStaffMerge([orphan, keep]);
    expect(decision?.keep.id).toBe("keep");
    expect(decision?.orphans.map((o) => o.id)).toEqual(["orphan"]);
  });
});
