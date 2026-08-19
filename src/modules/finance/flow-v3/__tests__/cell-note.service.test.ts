import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowRow: { findFirst: vi.fn() },
    financeFlowCellNote: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    financeFlowPlanCell: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  applyNoteToFuturePlanCells,
  loadCellNotes,
  stampCellNotes,
  upsertCellNote,
} from "../cell-note.service";
import { noteCellPreview } from "../cell-note-preview";

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as ReturnType<typeof vi.fn>;

describe("noteCellPreview", () => {
  it("trunca con elipsis", () => {
    expect(noteCellPreview("corto")).toBe("corto");
    expect(noteCellPreview("contador + abogado + prevencionista", 20).endsWith("…")).toBe(true);
  });
});

describe("upsertCellNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ id: "row-1" });
  });

  it("borra la nota si body vacío", async () => {
    asMock(prisma.financeFlowCellNote.deleteMany).mockResolvedValue({ count: 1 });
    const r = await upsertCellNote("t1", "row-1", "2026-08-03", "   ", "u1");
    expect(prisma.financeFlowCellNote.deleteMany).toHaveBeenCalled();
    expect(prisma.financeFlowCellNote.upsert).not.toHaveBeenCalled();
    expect(r.body).toBeNull();
  });

  it("guarda nota recortada", async () => {
    asMock(prisma.financeFlowCellNote.upsert).mockResolvedValue({
      body: "Motivo del desvío",
      updatedBy: "u1",
    });
    const r = await upsertCellNote(
      "t1",
      "row-1",
      "2026-08-03",
      "  Motivo del desvío  ",
      "u1",
    );
    expect(prisma.financeFlowCellNote.upsert).toHaveBeenCalledOnce();
    expect(r.body).toBe("Motivo del desvío");
  });

  it("rechaza weekStart que no es lunes", async () => {
    await expect(
      upsertCellNote("t1", "row-1", "2026-08-04", "hola", null),
    ).rejects.toThrow(/lunes/i);
  });
});

describe("stampCellNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ id: "row-1" });
    asMock(prisma.financeFlowCellNote.upsert).mockResolvedValue({
      body: "x",
      updatedBy: "u1",
    });
  });

  it("estampa en todas las semanas lunes", async () => {
    const n = await stampCellNotes(
      "t1",
      "row-1",
      ["2026-08-03", "2026-08-10", "2026-08-04"],
      "asesores",
      "u1",
    );
    expect(n).toBe(2);
    expect(prisma.financeFlowCellNote.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("applyNoteToFuturePlanCells", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ id: "row-1" });
    asMock(prisma.financeFlowPlanCell.findMany).mockResolvedValue([
      { weekStart: new Date("2026-08-10T00:00:00.000Z") },
      { weekStart: new Date("2026-08-17T00:00:00.000Z") },
    ]);
    asMock(prisma.financeFlowCellNote.upsert).mockResolvedValue({
      body: "desglose",
      updatedBy: "u1",
    });
  });

  it("incluye ancla y celdas futuras con plan", async () => {
    const r = await applyNoteToFuturePlanCells(
      "t1",
      "row-1",
      "2026-08-03",
      "desglose",
      "u1",
    );
    expect(r.weeks).toContain("2026-08-03");
    expect(r.weeks).toContain("2026-08-10");
    expect(r.weeks).toContain("2026-08-17");
  });
});

describe("loadCellNotes", () => {
  it("agrupa por fila y semana YMD", async () => {
    asMock(prisma.financeFlowCellNote.findMany).mockResolvedValue([
      {
        rowId: "r1",
        weekStart: new Date("2026-08-03T00:00:00.000Z"),
        body: "nota A",
      },
      {
        rowId: "r1",
        weekStart: new Date("2026-08-10T00:00:00.000Z"),
        body: "nota B",
      },
    ]);
    const map = await loadCellNotes(
      "t1",
      new Date("2026-08-03T00:00:00.000Z"),
      new Date("2026-08-31T00:00:00.000Z"),
    );
    expect(map.get("r1")?.get("2026-08-03")).toBe("nota A");
    expect(map.get("r1")?.get("2026-08-10")).toBe("nota B");
  });
});
