import { describe, expect, it } from "vitest";
import {
  classifyDrift,
  driftWithRttCompensation,
  shouldDiscardRtt,
  shouldNotifyDriftAlert,
} from "@/lib/time-sync/classify";
import { parseCloudflareTraceTs, parseHttpDate } from "@/lib/time-sync/parse";
import {
  isFaltaAlertDue,
  FALTA_ALERT_SEND_WINDOW_MS,
} from "@/lib/marcacion-alerta-falta-window";
import {
  parseAlertaEmployerEmailsInput,
  parseMarcacionConfigValue,
} from "@/lib/ops-marcacion-config";

describe("time-sync parse", () => {
  it("parsea Date HTTP", () => {
    const d = parseHttpDate("Tue, 01 Sep 2026 18:00:00 GMT");
    expect(d?.toISOString()).toBe("2026-09-01T18:00:00.000Z");
  });

  it("rechaza Date vacío", () => {
    expect(parseHttpDate(null)).toBeNull();
    expect(parseHttpDate("no-es-fecha")).toBeNull();
  });

  it("parsea ts= de Cloudflare trace", () => {
    const d = parseCloudflareTraceTs("fl=1\nts=1700000000.25\nloc=CL\n");
    expect(d?.toISOString()).toBe(new Date(1_700_000_000.25 * 1000).toISOString());
  });
});

describe("time-sync umbrales", () => {
  it("ok ≤ 60s, warn ≤ 300s, alert > 5 min", () => {
    expect(classifyDrift(0, true)).toBe("ok");
    expect(classifyDrift(60_000, true)).toBe("ok");
    expect(classifyDrift(60_001, true)).toBe("warn");
    expect(classifyDrift(300_000, true)).toBe("warn");
    expect(classifyDrift(300_001, true)).toBe("alert");
    expect(classifyDrift(null, false)).toBe("warn");
  });

  it("compensa RTT a la mitad", () => {
    const { rttMs, driftMs } = driftWithRttCompensation(1_000, 1_200, 1_100);
    expect(rttMs).toBe(200);
    expect(driftMs).toBe(0);
  });

  it("el desfase se calcula en UTC (cambio de hora legal no alerta)", () => {
    const ref = parseHttpDate("Sun, 05 Apr 2026 04:00:00 GMT");
    expect(ref).not.toBeNull();
    const t0 = ref!.getTime() - 40;
    const t1 = ref!.getTime() + 40;
    const { driftMs } = driftWithRttCompensation(t0, t1, ref!.getTime());
    expect(Math.abs(driftMs)).toBeLessThan(1);
    expect(classifyDrift(driftMs, true)).toBe("ok");
  });

  it("descarta RTT > 2s", () => {
    expect(shouldDiscardRtt(2001)).toBe(true);
    expect(shouldDiscardRtt(1999)).toBe(false);
  });
});

describe("time-sync alerta email", () => {
  const t1 = new Date("2026-09-01T12:00:00.000Z");
  const t2 = new Date("2026-09-01T12:10:00.000Z");

  it("reintenta si nunca hubo entrega exitosa", () => {
    expect(
      shouldNotifyDriftAlert({
        status: "alert",
        lastNotifiedAt: null,
        lastOkAt: null,
      }),
    ).toBe(true);
  });

  it("no reenvía en el mismo incidente tras una entrega", () => {
    expect(
      shouldNotifyDriftAlert({
        status: "alert",
        lastNotifiedAt: t1,
        lastOkAt: null,
      }),
    ).toBe(false);
  });

  it("vuelve a enviar tras recuperarse a ok", () => {
    expect(
      shouldNotifyDriftAlert({
        status: "alert",
        lastNotifiedAt: t1,
        lastOkAt: t2,
      }),
    ).toBe(true);
  });

  it("usa el reloj de inserción, no checkedAt sesgado al futuro", () => {
    const skewedCheck = new Date("2026-09-01T20:00:00.000Z");
    const createdAlert = new Date("2026-09-01T12:00:00.000Z");
    const createdOk = new Date("2026-09-01T12:10:00.000Z");
    expect(skewedCheck.getTime()).toBeGreaterThan(createdOk.getTime());
    expect(
      shouldNotifyDriftAlert({
        status: "alert",
        lastNotifiedAt: createdAlert,
        lastOkAt: createdOk,
      }),
    ).toBe(true);
  });

  it("no notifica si el estado no es alert", () => {
    expect(
      shouldNotifyDriftAlert({
        status: "warn",
        lastNotifiedAt: null,
        lastOkAt: null,
      }),
    ).toBe(false);
  });
});

describe("alerta 45.1 config", () => {
  it("queda apagada si el JSON del tenant no trae el flag", () => {
    const cfg = parseMarcacionConfigValue(JSON.stringify({ toleranciaAtrasoMinutos: 10 }));
    expect(cfg.alertaFaltaMarcacionEnabled).toBe(false);
    expect(cfg.alertaFaltaMarcacionEmployerEmails).toEqual([]);
  });

  it("parsea casillas de empresa", () => {
    expect(parseAlertaEmployerEmailsInput("Ops@Gard.cl, central@gard.cl\nbad")).toEqual([
      "ops@gard.cl",
      "central@gard.cl",
    ]);
  });
});

describe("alerta 45.1 ventana de envío", () => {
  it("no envía antes de vencer ni tras 2 horas", () => {
    const due = new Date("2026-09-01T12:00:00.000Z");
    expect(isFaltaAlertDue(new Date("2026-09-01T11:59:59.000Z"), due)).toBe(false);
    expect(isFaltaAlertDue(due, due)).toBe(true);
    expect(isFaltaAlertDue(new Date(due.getTime() + FALTA_ALERT_SEND_WINDOW_MS), due)).toBe(true);
    expect(isFaltaAlertDue(new Date(due.getTime() + FALTA_ALERT_SEND_WINDOW_MS + 1), due)).toBe(
      false,
    );
  });
});

describe("prestador legal", () => {
  it("no muestra placeholder de RUT si la env está vacía", async () => {
    const prev = process.env.NEXT_PUBLIC_PROVIDER_RUT;
    delete process.env.NEXT_PUBLIC_PROVIDER_RUT;
    const { getProviderLegalLine } = await import("@/lib/app-version");
    expect(getProviderLegalLine()).toBe("Opai SpA");
    process.env.NEXT_PUBLIC_PROVIDER_RUT = "76.123.456-7";
    expect(getProviderLegalLine()).toBe("Opai SpA, RUT 76.123.456-7");
    if (prev === undefined) delete process.env.NEXT_PUBLIC_PROVIDER_RUT;
    else process.env.NEXT_PUBLIC_PROVIDER_RUT = prev;
  });
});
