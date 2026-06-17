import { describe, it, expect } from "vitest";
import {
  resolverProximoTipo,
  getUltimaMarcacion,
  calcularAtrasoMinutos,
  chileDayStart,
  chileDayRange,
  resolverTrazabilidadMarca,
  buscarMarcacionPorIdempotencyKey,
  ejecutarConDedup,
} from "@/lib/marcacion-jornada";

// ── Mock mínimo de Prisma: solo lo que usan los helpers ──────────────────────
type Row = {
  tipo: string;
  timestamp: Date;
  id?: string;
  idempotencyKey?: string | null;
  deletedAt?: Date | null;
};

function makeDb(rows: Row[]) {
  return {
    opsMarcacion: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async (args: any) => {
        let out = rows.filter((r) => (r.deletedAt ?? null) === null);
        const ts = args?.where?.timestamp;
        if (ts) {
          if (ts.gte) out = out.filter((r) => r.timestamp >= ts.gte);
          if (ts.lte) out = out.filter((r) => r.timestamp <= ts.lte);
        }
        const key = args?.where?.idempotencyKey;
        if (key !== undefined) out = out.filter((r) => r.idempotencyKey === key);
        out = out.slice().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        const r = out[0];
        if (!r) return null;
        // Devolver solo los campos seleccionados (suficiente para los helpers)
        return { id: r.id ?? "id-1", tipo: r.tipo, timestamp: r.timestamp };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const ARGS = { guardiaId: "g1", tenantId: "t1", installationId: "i1" };

describe("resolverProximoTipo", () => {
  it("sin marcación reciente → entrada", async () => {
    const db = makeDb([]);
    const now = new Date("2026-01-16T11:00:00Z");
    expect(await resolverProximoTipo(db, { ...ARGS, now })).toBe("entrada");
  });

  it("entrada vigente sin salida → salida", async () => {
    const now = new Date("2026-01-16T11:00:00Z");
    const db = makeDb([{ tipo: "entrada", timestamp: new Date("2026-01-16T10:00:00Z") }]);
    expect(await resolverProximoTipo(db, { ...ARGS, now })).toBe("salida");
  });

  it("salida ya marcada → entrada", async () => {
    const now = new Date("2026-01-16T11:00:00Z");
    const db = makeDb([
      { tipo: "entrada", timestamp: new Date("2026-01-16T09:00:00Z") },
      { tipo: "salida", timestamp: new Date("2026-01-16T10:00:00Z") },
    ]);
    expect(await resolverProximoTipo(db, { ...ARGS, now })).toBe("entrada");
  });

  it("turno nocturno que cruza medianoche UTC → salida (caso que hoy falla)", async () => {
    // Entrada 20:00 Chile (verano, CLST UTC-3) = 23:00Z día 15; evaluar a 08:00 Chile día 16
    const now = new Date("2026-01-16T11:00:00Z");
    const db = makeDb([{ tipo: "entrada", timestamp: new Date("2026-01-15T23:00:00Z") }]);
    expect(await resolverProximoTipo(db, { ...ARGS, now })).toBe("salida");
  });

  it("turno que sale 21:00 Chile (00:00Z del día siguiente) → salida", async () => {
    // Entrada 09:00 Chile = 12:00Z día 15; evaluar a las 00:00Z del día 16 (21:00 Chile)
    const now = new Date("2026-01-16T00:00:00Z");
    const db = makeDb([{ tipo: "entrada", timestamp: new Date("2026-01-15T12:00:00Z") }]);
    expect(await resolverProximoTipo(db, { ...ARGS, now })).toBe("salida");
  });

  it("DST verano (UTC-3): nocturno resuelve salida", async () => {
    const now = new Date("2026-01-16T11:00:00Z"); // 08:00 Chile
    const db = makeDb([{ tipo: "entrada", timestamp: new Date("2026-01-15T23:00:00Z") }]); // 20:00 Chile
    expect(await resolverProximoTipo(db, { ...ARGS, now })).toBe("salida");
  });

  it("DST invierno (UTC-4): nocturno resuelve salida", async () => {
    const now = new Date("2026-07-16T12:00:00Z"); // 08:00 Chile (UTC-4)
    const db = makeDb([{ tipo: "entrada", timestamp: new Date("2026-07-16T00:00:00Z") }]); // 20:00 Chile día 15
    expect(await resolverProximoTipo(db, { ...ARGS, now })).toBe("salida");
  });

  it("marca más antigua que la ventana de 26h se ignora → entrada", async () => {
    const now = new Date("2026-01-16T11:00:00Z");
    // entrada 36h antes (fuera de la ventana de 26h)
    const db = makeDb([{ tipo: "entrada", timestamp: new Date("2026-01-14T23:00:00Z") }]);
    expect(await resolverProximoTipo(db, { ...ARGS, now })).toBe("entrada");
  });
});

describe("getUltimaMarcacion", () => {
  it("devuelve la última marca dentro de la ventana", async () => {
    const now = new Date("2026-01-16T11:00:00Z");
    const db = makeDb([
      { tipo: "entrada", timestamp: new Date("2026-01-16T09:00:00Z") },
      { tipo: "salida", timestamp: new Date("2026-01-16T10:30:00Z") },
    ]);
    const ultima = await getUltimaMarcacion(db, { ...ARGS, now });
    expect(ultima?.tipo).toBe("salida");
  });

  it("ignora marcas soft-deleted", async () => {
    const now = new Date("2026-01-16T11:00:00Z");
    const db = makeDb([
      { tipo: "entrada", timestamp: new Date("2026-01-16T10:00:00Z"), deletedAt: new Date() },
    ]);
    expect(await getUltimaMarcacion(db, { ...ARGS, now })).toBeNull();
  });
});

describe("calcularAtrasoMinutos (TZ Chile)", () => {
  it("shiftStart 08:00, marca 08:30 Chile → 30 min (no ~210)", async () => {
    // 2026-01-15 verano CLST (UTC-3): 08:30 Chile = 11:30Z
    const atraso = calcularAtrasoMinutos("08:00", new Date("2026-01-15T11:30:00Z"));
    expect(atraso).toBe(30);
  });

  it("invierno CLT (UTC-4): shiftStart 08:00, marca 08:30 Chile → 30 min", () => {
    // 2026-07-15 invierno (UTC-4): 08:30 Chile = 12:30Z
    const atraso = calcularAtrasoMinutos("08:00", new Date("2026-07-15T12:30:00Z"));
    expect(atraso).toBe(30);
  });

  it("marca antes de la hora → null (atraso negativo)", () => {
    // 07:30 Chile (antes de 08:00) en verano = 10:30Z
    expect(calcularAtrasoMinutos("08:00", new Date("2026-01-15T10:30:00Z"))).toBeNull();
  });

  it("sin shiftStart → null", () => {
    expect(calcularAtrasoMinutos(null, new Date())).toBeNull();
    expect(calcularAtrasoMinutos(undefined, new Date())).toBeNull();
  });
});

describe("chileDayStart / chileDayRange (@db.Date convención)", () => {
  it("23:00 Chile (02:00Z día siguiente) pertenece al día Chile anterior", () => {
    // 2026-01-16T02:00:00Z = 23:00 Chile del día 15 (verano UTC-3)
    const d = chileDayStart(new Date("2026-01-16T02:00:00Z"));
    expect(d.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(d.toISOString()).toBe("2026-01-15T00:00:00.000Z"); // medianoche UTC del día Chile
  });

  it("08:00 Chile (11:00Z) pertenece al mismo día UTC", () => {
    const d = chileDayStart(new Date("2026-01-16T11:00:00Z"));
    expect(d.toISOString().slice(0, 10)).toBe("2026-01-16");
  });

  it("chileDayRange cubre el día completo en Chile", () => {
    const { gte, lt } = chileDayRange(new Date("2026-01-16T11:00:00Z"));
    // Inicio = medianoche Chile = 03:00Z (verano UTC-3)
    expect(gte.toISOString()).toBe("2026-01-16T03:00:00.000Z");
    // Fin exclusivo = medianoche Chile del día siguiente
    expect(lt.toISOString()).toBe("2026-01-17T03:00:00.000Z");
  });
});

describe("resolverTrazabilidadMarca (marca tardía/offline)", () => {
  const serverTimestamp = new Date("2026-01-16T11:10:00Z");

  it("deviceTimestamp 10 min antes → offlineSync=true, origenMarca=sync_diferida", () => {
    const t = resolverTrazabilidadMarca({
      serverTimestamp,
      deviceTimestamp: "2026-01-16T11:00:00Z",
    });
    expect(t.esTardia).toBe(true);
    expect(t.offlineSync).toBe(true);
    expect(t.origenMarca).toBe("sync_diferida");
    expect(t.deviceTs?.toISOString()).toBe("2026-01-16T11:00:00.000Z");
  });

  it("sin deviceTimestamp → online, no tardía", () => {
    const t = resolverTrazabilidadMarca({ serverTimestamp });
    expect(t.esTardia).toBe(false);
    expect(t.offlineSync).toBe(false);
    expect(t.origenMarca).toBe("online");
    expect(t.deviceTs).toBeNull();
  });

  it("origenMarca offline_queue marca offlineSync aunque la diferencia sea pequeña", () => {
    const t = resolverTrazabilidadMarca({
      serverTimestamp,
      deviceTimestamp: "2026-01-16T11:09:30Z", // 30s, no tardía
      origenMarca: "offline_queue",
    });
    expect(t.esTardia).toBe(false);
    expect(t.offlineSync).toBe(true);
    expect(t.origenMarca).toBe("offline_queue");
  });
});

describe("idempotencia / dedup", () => {
  it("buscarMarcacionPorIdempotencyKey encuentra la marca previa", async () => {
    const db = makeDb([
      { id: "m1", tipo: "entrada", timestamp: new Date("2026-01-16T10:00:00Z"), idempotencyKey: "k-123" },
    ]);
    const dup = await buscarMarcacionPorIdempotencyKey(db, "t1", "k-123");
    expect(dup?.id).toBe("m1");
  });

  it("ejecutarConDedup: éxito normal devuelve value", async () => {
    const db = makeDb([]);
    const res = await ejecutarConDedup(async () => ({ id: "nuevo" }), {
      db,
      tenantId: "t1",
      idempotencyKey: "k-1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({ id: "nuevo" });
  });

  it("ejecutarConDedup: carrera P2002 devuelve la marca ganadora", async () => {
    const db = makeDb([
      { id: "ganadora", tipo: "entrada", timestamp: new Date("2026-01-16T10:00:00Z"), idempotencyKey: "k-race" },
    ]);
    const res = await ejecutarConDedup(
      async () => {
        throw { code: "P2002" };
      },
      { db, tenantId: "t1", idempotencyKey: "k-race" },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.dup.id).toBe("ganadora");
  });

  it("ejecutarConDedup: error no-P2002 se relanza", async () => {
    const db = makeDb([]);
    await expect(
      ejecutarConDedup(
        async () => {
          throw new Error("boom");
        },
        { db, tenantId: "t1", idempotencyKey: "k-x" },
      ),
    ).rejects.toThrow("boom");
  });
});
