import { describe, expect, it } from "vitest";
import { parseDateOnly } from "@/lib/ops";
import {
  addDays,
  isNotEndedOn,
  isVigenteOn,
  nextAsignacion,
  notEndedWhere,
  overlapsRange,
  resolveVigente,
  solapaRangoWhere,
  vigenteWhere,
} from "../asignacion-vigencia";

const d = (iso: string) => parseDateOnly(iso);

describe("isVigenteOn", () => {
  it("incluye el startDate (límite inferior inclusivo)", () => {
    const a = { startDate: d("2026-09-04"), endDate: null };
    expect(isVigenteOn(a, d("2026-09-04"))).toBe(true);
    expect(isVigenteOn(a, d("2026-09-03"))).toBe(false);
  });

  it("incluye el endDate (último día vigente)", () => {
    const a = { startDate: d("2026-08-01"), endDate: d("2026-09-03") };
    expect(isVigenteOn(a, d("2026-09-03"))).toBe(true);
    expect(isVigenteOn(a, d("2026-09-04"))).toBe(false);
    expect(isVigenteOn(a, d("2026-08-01"))).toBe(true);
  });

  it("endDate null permanece vigente indefinidamente", () => {
    const a = { startDate: d("2026-01-15"), endDate: null };
    expect(isVigenteOn(a, d("2026-01-15"))).toBe(true);
    expect(isVigenteOn(a, d("2026-12-31"))).toBe(true);
    expect(isVigenteOn(a, d("2026-01-14"))).toBe(false);
  });

  it("fuera de rango a ambos lados", () => {
    const a = { startDate: d("2026-09-01"), endDate: d("2026-09-10") };
    expect(isVigenteOn(a, d("2026-08-31"))).toBe(false);
    expect(isVigenteOn(a, d("2026-09-11"))).toBe(false);
  });
});

describe("overlapsRange", () => {
  const monthStart = d("2026-09-01");
  const monthEnd = d("2026-09-30");

  it("solapa si empieza durante el mes", () => {
    expect(
      overlapsRange({ startDate: d("2026-09-04"), endDate: null }, monthStart, monthEnd),
    ).toBe(true);
  });

  it("solapa si termina el último día del mes", () => {
    expect(
      overlapsRange(
        { startDate: d("2026-08-01"), endDate: d("2026-09-30") },
        monthStart,
        monthEnd,
      ),
    ).toBe(true);
  });

  it("solapa si cubre todo el mes (endDate null)", () => {
    expect(
      overlapsRange({ startDate: d("2026-01-01"), endDate: null }, monthStart, monthEnd),
    ).toBe(true);
  });

  it("no solapa si termina el día previo al mes", () => {
    expect(
      overlapsRange(
        { startDate: d("2026-08-01"), endDate: d("2026-08-31") },
        monthStart,
        monthEnd,
      ),
    ).toBe(false);
  });

  it("no solapa si empieza el día siguiente al mes", () => {
    expect(
      overlapsRange(
        { startDate: d("2026-10-01"), endDate: null },
        monthStart,
        monthEnd,
      ),
    ).toBe(false);
  });

  it("solapa un solo día en el borde (1 del mes / último del mes)", () => {
    expect(
      overlapsRange(
        { startDate: d("2026-08-15"), endDate: d("2026-09-01") },
        monthStart,
        monthEnd,
      ),
    ).toBe(true);
    expect(
      overlapsRange(
        { startDate: d("2026-09-30"), endDate: d("2026-10-10") },
        monthStart,
        monthEnd,
      ),
    ).toBe(true);
  });
});

describe("resolveVigente", () => {
  it("devuelve null si ninguna cubre la fecha", () => {
    expect(
      resolveVigente(
        [{ startDate: d("2026-09-04"), endDate: null }],
        d("2026-09-03"),
      ),
    ).toBeNull();
  });

  it("elige la de startDate mayor cuando hay solape legado de un día", () => {
    const prev = { id: "prev", startDate: d("2026-08-01"), endDate: d("2026-09-04") };
    const next = { id: "next", startDate: d("2026-09-04"), endDate: null };
    const picked = resolveVigente([prev, next], d("2026-09-04"));
    expect(picked?.id).toBe("next");
    expect(resolveVigente([next, prev], d("2026-09-03"))?.id).toBe("prev");
  });

  it("a igualdad de startDate gana la más nueva (createdAt)", () => {
    const older = {
      id: "older",
      startDate: d("2026-09-04"),
      endDate: null,
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
    };
    const newer = {
      id: "newer",
      startDate: d("2026-09-04"),
      endDate: null,
      createdAt: new Date("2026-08-31T12:00:00.000Z"),
    };
    expect(resolveVigente([older, newer], d("2026-09-04"))?.id).toBe("newer");
  });
});

describe("vigenteWhere / solapaRangoWhere", () => {
  it("vigenteWhere usa lte/gte inclusivos y OR de endDate null", () => {
    const date = d("2026-09-03");
    expect(vigenteWhere(date)).toEqual({
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    });
  });

  it("solapaRangoWhere cubre el mes con start lte end y endDate gte start", () => {
    const start = d("2026-09-01");
    const end = d("2026-09-30");
    expect(solapaRangoWhere(start, end)).toEqual({
      startDate: { lte: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
    });
  });
});

describe("nextAsignacion / isNotEndedOn", () => {
  const hoy = d("2026-09-03");

  it("elige la futura de startDate más cercano y ignora la vigente", () => {
    const vigente = { id: "saliente", startDate: d("2026-08-01"), endDate: d("2026-09-10") };
    const far = { id: "lejana", startDate: d("2026-10-01"), endDate: null };
    const near = { id: "entrante", startDate: d("2026-09-11"), endDate: null };
    expect(nextAsignacion([far, vigente, near], hoy)?.id).toBe("entrante");
    expect(nextAsignacion([vigente], hoy)).toBeNull();
  });

  it("isNotEndedOn incluye hoy, futuras y endDate null; excluye vencidas", () => {
    expect(isNotEndedOn({ endDate: d("2026-09-03") }, hoy)).toBe(true);
    expect(isNotEndedOn({ endDate: null }, hoy)).toBe(true);
    expect(isNotEndedOn({ endDate: d("2026-09-02") }, hoy)).toBe(false);
  });

  it("notEndedWhere no filtra por startDate (incluye futuras)", () => {
    expect(notEndedWhere(hoy)).toEqual({
      OR: [{ endDate: null }, { endDate: { gte: hoy } }],
    });
  });
});

describe("addDays", () => {
  it("resta un día para default de traslado (startDate − 1)", () => {
    expect(addDays(d("2026-09-04"), -1).toISOString()).toBe(
      d("2026-09-03").toISOString(),
    );
  });

  it("cruza fin de mes y año en UTC", () => {
    expect(addDays(d("2026-09-01"), -1).toISOString()).toBe(
      d("2026-08-31").toISOString(),
    );
    expect(addDays(d("2026-12-31"), 1).toISOString()).toBe(
      d("2027-01-01").toISOString(),
    );
  });
});

describe("isVigenciaSyncUtcHour", () => {
  it("corre solo en la hora UTC 4 (slot diario embebido en consolidar-marcaciones)", async () => {
    const { isVigenciaSyncUtcHour } = await import("../sync-asignaciones-vigencia");
    expect(isVigenciaSyncUtcHour(new Date("2026-08-31T04:00:00.000Z"))).toBe(true);
    expect(isVigenciaSyncUtcHour(new Date("2026-08-31T04:59:59.000Z"))).toBe(true);
    expect(isVigenciaSyncUtcHour(new Date("2026-08-31T03:59:59.000Z"))).toBe(false);
    expect(isVigenciaSyncUtcHour(new Date("2026-08-31T05:00:00.000Z"))).toBe(false);
  });
});
