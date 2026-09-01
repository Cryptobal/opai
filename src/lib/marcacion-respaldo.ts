/**
 * Respaldo mensual de marcaciones a R2 con manifiesto SHA-256 (Art. 14 b / 20 e).
 */

import { createHash } from "crypto";
import { gzipSync } from "zlib";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { ymdInChile, todayInChile } from "@/lib/dates-cl";

export interface MarcacionRespaldoManifest {
  tenantId: string;
  periodYear: number;
  periodMonth: number;
  dateFrom: string;
  dateTo: string;
  recordCount: number;
  byteSize: number;
  fileSha256: string;
  generatedAt: string;
  storageKey: string;
}

function previousMonth(now: Date): { year: number; month: number } {
  const ymd = todayInChile(now);
  const [y, m] = ymd.split("-").map(Number);
  if (m === 1) return { year: y - 1, month: 12 };
  return { year: y, month: m - 1 };
}

function monthRangeUtc(year: number, month: number): { from: Date; to: Date; fromYmd: string; toYmd: string } {
  const fromYmd = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toYmd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return {
    from: new Date(`${fromYmd}T00:00:00.000Z`),
    to: new Date(`${toYmd}T23:59:59.999Z`),
    fromYmd,
    toYmd,
  };
}

export async function runRespaldoMarcaciones(now: Date = new Date()): Promise<{
  tenants: number;
  created: number;
  skipped: number;
  errors: number;
}> {
  const { year, month } = previousMonth(now);
  const { from, to, fromYmd, toYmd } = monthRangeUtc(year, month);

  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true },
  });

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const tenant of tenants) {
    try {
      const existing = await prisma.opsMarcacionRespaldo.findUnique({
        where: {
          tenantId_periodYear_periodMonth: {
            tenantId: tenant.id,
            periodYear: year,
            periodMonth: month,
          },
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const rows = await prisma.opsMarcacion.findMany({
        where: {
          tenantId: tenant.id,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "asc" },
        select: {
          id: true,
          guardiaId: true,
          installationId: true,
          tipo: true,
          timestamp: true,
          lat: true,
          lng: true,
          metodoId: true,
          hashIntegridad: true,
          gpsStatus: true,
          isModified: true,
          deletedAt: true,
          employerRut: true,
          employerName: true,
        },
      });

      const json = JSON.stringify({
        tenantId: tenant.id,
        period: { year, month, from: fromYmd, to: toYmd },
        recordCount: rows.length,
        records: rows,
      });
      const gz = gzipSync(Buffer.from(json, "utf8"));
      const fileSha256 = createHash("sha256").update(gz).digest("hex");

      const uploaded = await uploadFile(
        gz,
        `marcaciones-${year}-${String(month).padStart(2, "0")}.json.gz`,
        "application/gzip",
        "marcacion-respaldos",
        tenant.id,
      );

      const manifest: MarcacionRespaldoManifest = {
        tenantId: tenant.id,
        periodYear: year,
        periodMonth: month,
        dateFrom: fromYmd,
        dateTo: toYmd,
        recordCount: rows.length,
        byteSize: gz.length,
        fileSha256,
        generatedAt: now.toISOString(),
        storageKey: uploaded.storageKey,
      };
      const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
      const manifestSha256 = createHash("sha256").update(manifestBuf).digest("hex");
      const manifestUpload = await uploadFile(
        manifestBuf,
        `marcaciones-${year}-${String(month).padStart(2, "0")}.manifest.json`,
        "application/json",
        "marcacion-respaldos",
        tenant.id,
      );

      await prisma.opsMarcacionRespaldo.create({
        data: {
          tenantId: tenant.id,
          periodYear: year,
          periodMonth: month,
          storageKey: uploaded.storageKey,
          manifestKey: manifestUpload.storageKey,
          fileSha256,
          manifestSha256,
          recordCount: rows.length,
          byteSize: gz.length,
          dateFrom: from,
          dateTo: to,
        },
      });
      created++;
    } catch (err) {
      errors++;
      console.error(`[respaldo-marcaciones] tenant ${tenant.id}:`, err);
    }
  }

  return { tenants: tenants.length, created, skipped, errors };
}

export function shouldRunMonthlyRespaldo(now: Date = new Date()): boolean {
  const day = Number(todayInChile(now).slice(8, 10));
  return day === 2;
}

export { ymdInChile };
