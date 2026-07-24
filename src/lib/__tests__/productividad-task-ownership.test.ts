import { describe, it, expect } from "vitest";
import { canDeleteTarea } from "@/lib/productividad-task-ownership";

describe("canDeleteTarea", () => {
  it("permite al creador eliminar su tarea", () => {
    expect(canDeleteTarea({ createdBy: "u1" }, "u1", "supervisor")).toBe(true);
  });

  it("niega al responsable asignado que no creó la tarea", () => {
    expect(canDeleteTarea({ createdBy: "u1" }, "u2", "supervisor")).toBe(false);
  });

  it("permite owner/admin aunque no sea creador", () => {
    expect(canDeleteTarea({ createdBy: "u1" }, "u2", "admin")).toBe(true);
    expect(canDeleteTarea({ createdBy: "u1" }, "u2", "owner")).toBe(true);
  });

  it("niega eliminar tareas legacy sin createdBy (excepto admin)", () => {
    expect(canDeleteTarea({ createdBy: null }, "u1", "supervisor")).toBe(false);
    expect(canDeleteTarea({ createdBy: null }, "u1", "admin")).toBe(true);
  });
});
