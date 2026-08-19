/**
 * Compone N buildProposalProps (una por cotización incluida) en un ProposalProps
 * consolidado para PDF/correo de proposal bundle. No modifica la firma de
 * buildProposalProps.
 */

import { prisma } from "@/lib/prisma";
import { formatCurrency, formatUFSuffix } from "@/lib/utils";
import { getUfValue, clpToUf } from "@/lib/uf";
import { buildProposalProps } from "./build-proposal-props";
import type { ProposalProps } from "./build-proposal-props";
import {
  buildDotacionContentForInstallations,
  loadDotacionPositions,
} from "@/lib/cpq/proposal-sections/build-dotacion";
import { isDotacionSection } from "@/lib/cpq/proposal-sections/generate-batch";
import {
  consolidateQuoteBreakdowns,
  consolidateResourceBreakdowns,
} from "./consolidate-bundle-breakdown";

/** Mismas etiquetas que build-proposal-props para las condiciones del bundle. */
const PAYMENT_LABELS: Record<string, string> = {
  contrafactura: "Mensual, contra entrega de factura",
  "30_dias": "30 días",
  "30dias": "30 días",
  anticipado: "Pago anticipado",
};

export async function buildBundleProposalProps(
  bundleId: string,
  tenantId: string,
  opts?: { pdfMode?: "draft" | "final" },
): Promise<ProposalProps & { fileName: string }> {
  const bundle = await prisma.cpqProposalBundle.findFirst({
    where: { id: bundleId, tenantId },
    include: {
      quotes: {
        where: { includedInProposal: true },
        orderBy: { displayOrder: "asc" },
        select: { quoteId: true },
      },
    },
  });

  if (!bundle) {
    throw new Error("BUNDLE_NOT_FOUND");
  }
  if (bundle.quotes.length === 0) {
    throw new Error("BUNDLE_EMPTY");
  }

  const perQuote = await Promise.all(
    bundle.quotes.map((m) => buildProposalProps(m.quoteId, tenantId, opts)),
  );

  const base = perQuote[0]!;
  const ufVal = base.ufValue ?? (await getUfValue()) ?? 0;
  const currency = bundle.currency || base.currency || "UF";
  const fmt = (clp: number) =>
    currency === "UF" && ufVal > 0
      ? formatUFSuffix(clpToUf(clp, ufVal))
      : formatCurrency(clp);

  const installations: NonNullable<ProposalProps["installations"]> =
    perQuote.map((p) => ({
      quoteCode: p.quotationCode,
      name: p.installationName,
      city: p.installationCity,
      address: p.installationAddress,
      staffingCount: p.staffingCount,
      totalPositions: p.items.reduce((s, i) => s + (i.quantity || 0), 0),
      coverageSchedule: p.coverageSchedule,
      monthly: p.totalNeto,
      monthlyFormatted: p.totalNetoFormatted,
      items: p.items,
      // Pagos únicos por instalación: se cobran una vez y NO entran al mensual.
      // El subtotal se recalcula desde los mismos items que se imprimen, para
      // que cuadre con el total consolidado (que también los suma).
      oneTimeItems: p.oneTimeItems,
      oneTimeTotalFormatted:
        p.oneTimeItems && p.oneTimeItems.length > 0
          ? fmt(p.oneTimeItems.reduce((s, i) => s + (i.subtotal || 0), 0))
          : undefined,
    }));

  // Pagos únicos consolidados: renumerados y prefijados con la instalación
  // para que el bloque global sea legible (antes solo salían los de la primera).
  const consolidatedOneTimeItems: ProposalProps["oneTimeItems"] = [];
  let oneTimeIdx = 1;
  for (const inst of installations) {
    for (const item of inst.oneTimeItems ?? []) {
      consolidatedOneTimeItems.push({
        ...item,
        index: oneTimeIdx++,
        description: `${inst.name} — ${item.description}`,
      });
    }
  }
  const totalOneTime = consolidatedOneTimeItems.reduce(
    (s, i) => s + (i.subtotal || 0),
    0,
  );

  const totalMonthly = installations.reduce((s, i) => s + i.monthly, 0);
  const totalGuards = installations.reduce((s, i) => s + i.staffingCount, 0);
  const totalPositions = installations.reduce(
    (s, i) => s + i.totalPositions,
    0,
  );

  const names = installations
    .map((i) => i.name)
    .filter((n) => n && n !== "-");
  const installationLabel =
    names.length <= 2
      ? names.join(" · ") || `${installations.length} instalaciones`
      : `${names[0]} + ${names.length - 1} más`;

  const { fileName: _ignored, ...baseProps } = base;

  // Dotación consolidada: puestos de TODAS las cotizaciones incluidas.
  let proposalSections = baseProps.proposalSections
    ? [...baseProps.proposalSections]
    : undefined;
  try {
    const installationBlocks = await Promise.all(
      bundle.quotes.map(async (m, idx) => {
        const positions = await loadDotacionPositions(m.quoteId);
        const name =
          perQuote[idx]?.installationName?.trim() ||
          `Instalación ${idx + 1}`;
        return { name, positions };
      }),
    );
    const consolidatedDotacion =
      buildDotacionContentForInstallations(installationBlocks);
    if (proposalSections) {
      proposalSections = proposalSections.map((section) =>
        isDotacionSection(section)
          ? { ...section, content: consolidatedDotacion }
          : section,
      );
    }
  } catch (err) {
    console.error(
      "[Bundle Proposal] Dotación consolidada falló — se conserva la de la 1ª cotización:",
      err,
    );
  }

  const breakdown = consolidateQuoteBreakdowns(perQuote.map((p) => p.breakdown));
  const resourceBreakdown = consolidateResourceBreakdowns(
    perQuote.map((p) => p.resourceBreakdown),
  );

  const props: ProposalProps = {
    ...baseProps,
    // Cinturón: el PDF de correo / envío final no debe heredar BORRADOR
    // de una cotización hija aún en borrador documental.
    watermark: opts?.pdfMode === "final" ? null : baseProps.watermark,
    quotationCode: bundle.code,
    installationName: installationLabel,
    installationCity: undefined,
    installationAddress: `${installations.length} instalaciones`,
    staffingCount: totalGuards,
    totalNeto: totalMonthly,
    totalNetoFormatted: fmt(totalMonthly),
    currency: currency === "UF" ? "UF" : "CLP",
    validUntil: bundle.validUntil
      ? new Date(bundle.validUntil).toLocaleDateString("es-CL", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : base.validUntil,
    // Condiciones comerciales: el bundle es la fuente de verdad cuando las
    // gobierna; si no, se conserva lo de la cotización de referencia.
    paymentTerms: bundle.paymentTerms
      ? PAYMENT_LABELS[bundle.paymentTerms] ?? bundle.paymentTerms
      : base.paymentTerms,
    oneTimeItems:
      consolidatedOneTimeItems.length > 0 ? consolidatedOneTimeItems : undefined,
    oneTimeTotalFormatted: totalOneTime > 0 ? fmt(totalOneTime) : undefined,
    installations,
    consolidatedSummary: {
      totalMonthly,
      totalMonthlyFormatted: fmt(totalMonthly),
      totalGuards,
      totalPositions,
      installationCount: installations.length,
      currency: currency === "UF" ? "UF" : "CLP",
      totalOneTime: totalOneTime > 0 ? totalOneTime : undefined,
      totalOneTimeFormatted: totalOneTime > 0 ? fmt(totalOneTime) : undefined,
    },
    proposalSections,
    breakdown,
    resourceBreakdown,
  };

  const safeClient = (base.companyName || "Cliente")
    .replace(/[^\w\s\-áéíóúñÁÉÍÓÚÑ]/gi, "")
    .trim()
    .slice(0, 40);
  const fileName = `Propuesta-${bundle.code}-${safeClient || "Cliente"}.pdf`;

  return { ...props, fileName };
}
