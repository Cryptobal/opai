/**
 * API Route: /api/fx/sync
 * GET - Sincroniza UF y UTM del día desde CMF (ex-SBIF)
 *
 * Se ejecuta diariamente vía Vercel Cron.
 * También puede invocarse manualmente con ?force=true
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayChileStr } from "@/lib/fx-date";

const CMF_API_KEY = process.env.CMF_API_KEY;
const CMF_BASE = "https://api.cmfchile.cl/api-sbifv3/recursos_api";

// Header para proteger el cron (Vercel envía este header)
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Parsea valor CMF "39.703,49" → 39703.49
 */
function parseCmfValue(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned);
}

/**
 * Fetch UF para una fecha concreta desde CMF (endpoint por día).
 * La UF se publica diariamente; usar la fecha del día en Chile.
 */
async function fetchUfFromCmfForDate(dateStr: string): Promise<{ value: number; date: string } | null> {
  if (!CMF_API_KEY) throw new Error("CMF_API_KEY no configurada");

  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return null;

  const url = `${CMF_BASE}/uf/${year}/${month}/dias/${day}?apikey=${CMF_API_KEY}&formato=json`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    console.error(`CMF UF API (${dateStr}) responded ${res.status}`);
    return null;
  }

  const data = await res.json();
  const ufs = data?.UFs;

  if (!ufs || !Array.isArray(ufs) || ufs.length === 0) return null;

  const uf = ufs[0];
  const value = parseCmfValue(uf.Valor);
  const date = uf.Fecha;

  if (isNaN(value) || !date) return null;
  return { value, date };
}

/**
 * Fetch UF del día desde CMF. Por defecto pide hoy (Chile).
 * Si se pasa dateStr (ej. ?date=2026-02-10), pide esa fecha.
 */
async function fetchUfFromCmf(dateStr?: string): Promise<{ value: number; date: string } | null> {
  const today = dateStr ?? todayChileStr();
  let uf = await fetchUfFromCmfForDate(today);
  if (uf) return uf;
  if (dateStr) return null;
  // Si hoy no está aún (CMF publica en la mañana), usar ayer
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterdayStr = d.toISOString().slice(0, 10);
  return fetchUfFromCmfForDate(yesterdayStr);
}

/**
 * Fetch UTM del mes desde CMF
 */
async function fetchUtmFromCmf(): Promise<{ value: number; month: string } | null> {
  if (!CMF_API_KEY) throw new Error("CMF_API_KEY no configurada");

  const url = `${CMF_BASE}/utm?apikey=${CMF_API_KEY}&formato=json`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    console.error(`CMF UTM API responded ${res.status}`);
    return null;
  }

  const data = await res.json();
  const utms = data?.UTMs;

  if (!utms || !Array.isArray(utms) || utms.length === 0) {
    console.error("CMF UTM: respuesta vacía o sin datos", data);
    return null;
  }

  const utm = utms[0];
  const value = parseCmfValue(utm.Valor);
  const fecha = utm.Fecha; // "YYYY-MM-DD"

  if (isNaN(value) || !fecha) {
    console.error("CMF UTM: valor inválido", utm);
    return null;
  }

  // UTM se registra por mes (primer día del mes)
  const monthDate = fecha.substring(0, 7) + "-01"; // "YYYY-MM-01"

  return { value, month: monthDate };
}

export async function GET(request: NextRequest) {
  // Validar que viene del cron de Vercel o es forzado manualmente
  const authHeader = request.headers.get("authorization");
  const isForced = new URL(request.url).searchParams.get("force") === "true";
  const isCron = CRON_SECRET
    ? authHeader === `Bearer ${CRON_SECRET}`
    : true; // Si no hay CRON_SECRET, permitir (dev)

  if (!isForced && !isCron) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  if (!CMF_API_KEY) {
    return NextResponse.json(
      { success: false, error: "CMF_API_KEY no configurada" },
      { status: 500 }
    );
  }

  const results: Record<string, unknown> = {};
  const dateParam = new URL(request.url).searchParams.get("date"); // opcional: 2026-02-10

  // === UF ===
  try {
    const uf = await fetchUfFromCmf(dateParam ?? undefined);
    if (uf) {
      const dateObj = new Date(uf.date + "T00:00:00Z");

      await prisma.fxUfRate.upsert({
        where: { date: dateObj },
        update: {
          value: uf.value,
          fetchedAt: new Date(),
          source: "CMF",
        },
        create: {
          date: dateObj,
          value: uf.value,
          fetchedAt: new Date(),
          source: "CMF",
        },
      });

      results.uf = { value: uf.value, date: uf.date, status: "ok" };
      console.log(`✓ UF sincronizada: ${uf.value} (${uf.date})`);
    } else {
      results.uf = { status: "no_data" };
    }
  } catch (error) {
    console.error("Error sincronizando UF:", error);
    results.uf = { status: "error", message: String(error) };
  }

  // === UTM ===
  try {
    const utm = await fetchUtmFromCmf();
    if (utm) {
      const monthObj = new Date(utm.month + "T00:00:00Z");

      await prisma.fxUtmRate.upsert({
        where: { month: monthObj },
        update: {
          value: utm.value,
          fetchedAt: new Date(),
          source: "CMF",
        },
        create: {
          month: monthObj,
          value: utm.value,
          fetchedAt: new Date(),
          source: "CMF",
        },
      });

      results.utm = { value: utm.value, month: utm.month, status: "ok" };
      console.log(`✓ UTM sincronizada: ${utm.value} (${utm.month})`);
    } else {
      results.utm = { status: "no_data" };
    }
  } catch (error) {
    console.error("Error sincronizando UTM:", error);
    results.utm = { status: "error", message: String(error) };
  }

  return NextResponse.json({
    success: true,
    syncedAt: new Date().toISOString(),
    results,
  });
}
