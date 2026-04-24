import { loadGuardiasForInstallations } from "@/lib/portal-cliente-guardias";
import { toXlsx } from "../xlsx";
import type { GenerateParams, GenerateResult } from "../types";

export async function generate(params: GenerateParams): Promise<GenerateResult> {
  const { tenantId, installationIds } = params;

  const guardias = await loadGuardiasForInstallations({
    tenantId,
    installationIds,
  });

  const totalGuardias = guardias.length;
  const os10Vigente = guardias.filter((g) => g.os10Estado === "vigente").length;
  const os10PorVencer = guardias.filter(
    (g) => g.os10Estado === "por_vencer",
  ).length;
  const os10Vencido = guardias.filter(
    (g) => g.os10Estado === "vencido" || g.os10Estado === "pendiente",
  ).length;
  const docsVencidos = guardias.reduce(
    (acc, g) => acc + g.resumen.vencidos,
    0,
  );
  const docsPendientes = guardias.reduce(
    (acc, g) => acc + g.resumen.pendientes,
    0,
  );
  const os10Pct =
    totalGuardias > 0 ? Math.round((os10Vigente * 100) / totalGuardias) : 0;

  const resumen = {
    totalGuardias,
    os10Vigente,
    os10PorVencer,
    os10Vencido,
    os10Pct,
    docsVencidos,
    docsPendientes,
  };

  const detalle = guardias.map((g) => ({
    guardia: g.nombre,
    os10: g.os10Estado,
    os10Vence: g.os10ExpiresAt
      ? new Date(g.os10ExpiresAt).toLocaleDateString("es-CL")
      : "",
    docsTotal: g.resumen.total,
    docsVigentes: g.resumen.vigentes,
    docsPorVencer: g.resumen.porVencer,
    docsVencidos: g.resumen.vencidos,
    docsPendientes: g.resumen.pendientes,
  }));

  const xlsxBuffer = await toXlsx([
    {
      name: "Resumen",
      columns: [
        { header: "Métrica", key: "metrica", width: 32 },
        { header: "Valor", key: "valor", width: 20 },
      ],
      rows: [
        { metrica: "Total guardias", valor: totalGuardias },
        { metrica: "OS-10 vigente", valor: os10Vigente },
        { metrica: "% OS-10 vigente", valor: `${os10Pct}%` },
        { metrica: "OS-10 por vencer", valor: os10PorVencer },
        { metrica: "OS-10 vencido", valor: os10Vencido },
        { metrica: "Documentos vencidos", valor: docsVencidos },
        { metrica: "Documentos pendientes", valor: docsPendientes },
      ],
    },
    {
      name: "Detalle por guardia",
      columns: [
        { header: "Guardia", key: "guardia", width: 28 },
        { header: "OS-10", key: "os10", width: 14 },
        { header: "OS-10 vence", key: "os10Vence", width: 14 },
        { header: "Docs total", key: "docsTotal", width: 12 },
        { header: "Docs vigentes", key: "docsVigentes", width: 14 },
        { header: "Docs por vencer", key: "docsPorVencer", width: 16 },
        { header: "Docs vencidos", key: "docsVencidos", width: 14 },
        { header: "Docs pendientes", key: "docsPendientes", width: 16 },
      ],
      rows: detalle,
    },
  ]);

  return {
    data: { resumen, detalle },
    pdfBuffer: null, // PDF queda pendiente (se activa al añadir shell + componente PDF)
    xlsxBuffer,
  };
}
