import { describe, expect, it } from "vitest";
import { templateAppliesToGuardia } from "../laborales/scope";
import { dueAutoStampIds } from "../laborales/auto-stamp";

describe("templateAppliesToGuardia", () => {
  it("exige instalación activa para global_active", () => {
    expect(
      templateAppliesToGuardia({
        scopeType: "global_active",
        isActive: true,
        installationIds: [],
        currentInstallationId: "inst-1",
        installationIsActive: true,
      }),
    ).toBe(true);
    expect(
      templateAppliesToGuardia({
        scopeType: "global_active",
        isActive: true,
        installationIds: [],
        currentInstallationId: null,
        installationIsActive: false,
      }),
    ).toBe(false);
  });

  it("filtra por instalaciones específicas", () => {
    expect(
      templateAppliesToGuardia({
        scopeType: "installations",
        isActive: true,
        installationIds: ["a", "b"],
        currentInstallationId: "b",
        installationIsActive: true,
      }),
    ).toBe(true);
    expect(
      templateAppliesToGuardia({
        scopeType: "installations",
        isActive: true,
        installationIds: ["a"],
        currentInstallationId: "b",
        installationIsActive: true,
      }),
    ).toBe(false);
  });
});

describe("dueAutoStampIds", () => {
  const recs = [
    { id: "t", role: "signer", status: "pending", signingOrder: 1, autoStamp: false },
    { id: "rl", role: "signer", status: "pending", signingOrder: 2, autoStamp: true },
  ];

  it("en secuencial no estampa si el turno es el trabajador", () => {
    expect(dueAutoStampIds("sequential", recs)).toEqual([]);
  });

  it("en paralelo estampa autos pendientes", () => {
    expect(dueAutoStampIds("parallel", recs)).toEqual(["rl"]);
  });

  it("en secuencial estampa al siguiente auto tras firmar el trabajador", () => {
    const after = [
      { ...recs[0], status: "signed" },
      recs[1],
    ];
    expect(dueAutoStampIds("sequential", after)).toEqual(["rl"]);
  });
});
