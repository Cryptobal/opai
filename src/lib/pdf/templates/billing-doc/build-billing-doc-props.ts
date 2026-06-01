/**
 * Construye las props completas para el renderer del documento de cobro
 * (Proforma / Estado de Pago) a partir de un FinanceDte persistido.
 *
 * Se carga TODO en una sola pasada para evitar N+1: DTE + lines + cliente
 * CRM + contacto Estado de Pago + instalación + tenant config + signers
 * activos + base64 de las firmas (R2). El renderer recibe props 100%
 * resueltas y NO toca BD.
 */

import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { resolveBrandColors } from "@/modules/finance/billing/billing-doc-config.service";
import { listSigners } from "@/modules/finance/billing/billing-signers.service";
import { getFileBuffer } from "@/lib/storage";
import { renderVerificationCode } from "@/lib/validations/billing-doc";

export type BillingDocVariant = "PROFORMA" | "ESTADO_DE_PAGO" | "DTE_PREVIEW";

export interface BillingDocSignerProp {
  id: string;
  name: string;
  role: string;
  /** Imagen PNG/JPG de la firma como dataURL base64. Null si no hay imagen. */
  signatureDataUrl: string | null;
}

/**
 * Bloque de firmas del PDF: dos lados.
 *  - tenant: firmantes del lado del emisor (TenantBillingSigner) — tienen
 *    imagen de firma manuscrita (R2).
 *  - client: contactos del cliente que firman (CrmContact) — solo nombre +
 *    cargo + línea para firmar manuscrita en papel impreso.
 */
export interface BillingDocSignersBlock {
  tenant: BillingDocSignerProp[];
  client: BillingDocSignerProp[];
}

export interface BillingDocLine {
  lineNumber: number;
  itemCode: string | null;
  itemName: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  unitPriceUf: number | null;
  discountPct: number;
  netAmount: number;
  isExempt: boolean;
  /** Metadata específica para Estado de Pago (días, factor zona, fechas). */
  estadoPagoMeta: {
    dias?: number;
    factorZona?: number;
    fechaEjecucion?: string;
    fechaReporteTrabajo?: string;
    fechaInformeTecnico?: string;
  } | null;
  /**
   * Nombre de la instalación de la línea (resuelto desde costCenter →
   * installation). Solo presente cuando hay multi-instalación; sino null
   * y el renderer cae al `document.installationName` de cabecera.
   */
  installationName: string | null;
}

export interface BillingDocProps {
  variant: BillingDocVariant;

  emisor: {
    rut: string;
    razonSocial: string;
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
    ciudad: string | null;
    telefono: string | null;
    email: string | null;
    /** Logo en base64 dataURL (de TenantDteConfig.logoBase64 o brandingLogoFull). */
    logoDataUrl: string | null;
    brandNameUpper: string;
  };

  receptor: {
    rut: string;
    razonSocial: string;
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
    ciudad: string | null;
    /** Nombre del contacto receptor (para Estado de Pago). */
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };

  document: {
    /** Para draft = "—"; para emitido = "1234". */
    folio: string;
    /** Tipo SII: 33, 34, etc. */
    dteType: number;
    /** Nombre del tipo: "FACTURA ELECTRÓNICA", etc. */
    dteTypeName: string;
    /** Fecha emisión formateada DD/MM/YYYY. */
    dateFormatted: string;
    /** ISO YYYY-MM-DD. */
    dateIso: string;
    /** N° Orden / Contrato del cliente (CrmAccount.numeroOrdenContrato). */
    numeroOrdenContrato: string | null;
    /** Nombre de la instalación si aplica. */
    installationName: string | null;
    /** Periodo "marzo 2026" para títulos de Estado de Pago. */
    periodoLabel: string;
    /** Código de verificación renderizado (para Estado de Pago). */
    verificationCode: string;
    /**
     * Referencias adicionales cargadas en el DTE (OC, HES, Contrato, etc).
     * Vienen de FinanceDte.additionalReferences (JSON). Solo se incluyen
     * las que tienen folio cargado para no imprimir filas con "#" vacío.
     */
    additionalReferences: Array<{
      label: string;
      folio: string;
      reason: string | null;
    }>;
  };

  lines: BillingDocLine[];

  totals: {
    netAmount: number;
    exemptAmount: number;
    taxRate: number;
    taxAmount: number;
    totalAmount: number;
    currency: "CLP" | "UF";
    /** UF del día si currency=UF. */
    ufValueAtIssue: number | null;
  };

  /** Firmantes del PDF: tenant (con firma R2) + cliente (solo nombre/cargo). */
  signers: BillingDocSignersBlock;

  branding: {
    primary: string;
    secondary: string;
    /** Footer legal personalizado (Estado de Pago). */
    estadoPagoFooterLegal: string | null;
  };

  notes: string | null;

  /**
   * Agrupación de líneas por instalación. Undefined si todas las líneas
   * comparten instalación (renderizar como tabla plana). Si tiene 2+
   * grupos, el render usa subheaders por instalación.
   */
  installationGroups?: Array<{
    installationName: string;
    lineIndexes: number[];
    subtotalNet: number;
  }>;
}

const DTE_TYPE_NAMES: Record<number, string> = {
  33: "FACTURA ELECTRÓNICA",
  34: "FACTURA EXENTA ELECTRÓNICA",
  39: "BOLETA ELECTRÓNICA",
  41: "BOLETA EXENTA ELECTRÓNICA",
  52: "GUÍA DE DESPACHO ELECTRÓNICA",
  56: "NOTA DE DÉBITO ELECTRÓNICA",
  61: "NOTA DE CRÉDITO ELECTRÓNICA",
};

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function periodoLabel(d: Date): string {
  return `${MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fetchSignatureDataUrl(
  storageKey: string | null,
): Promise<string | null> {
  if (!storageKey) return null;
  try {
    const buf = await getFileBuffer(storageKey, 1024 * 1024);
    const ext = storageKey.toLowerCase().endsWith(".png") ? "png" : "jpeg";
    return `data:image/${ext};base64,${buf.toString("base64")}`;
  } catch (err) {
    console.warn(
      "[billing-doc] No se pudo cargar imagen de firma",
      storageKey,
      err,
    );
    return null;
  }
}

function logoDataUrlFromConfig(logoBase64: string | null): string | null {
  if (!logoBase64) return null;
  if (logoBase64.startsWith("data:")) return logoBase64;
  return `data:image/png;base64,${logoBase64}`;
}

export interface BuildBillingDocPropsOptions {
  /** Override de firmantes del tenant (lista de IDs). Si null/undefined, usa todos los activos. */
  signerOverrideIds?: string[];
  /**
   * Override de firmantes del cliente (lista de CrmContact IDs). Si
   * null/undefined, usa los del plan persistido en el DTE
   * (estadoPagoRecipientContactIds).
   */
  clientSignerContactIdsOverride?: string[];
  /**
   * Email del destinatario primario que va al "Para:" del envío. Si se
   * provee, la salutación del email + el contactName del documento usan
   * el CrmContact que matchea este email (no el contactoEstadoPago
   * default del account, que puede ser otra persona).
   */
  primaryRecipientEmail?: string | null;
}

export async function buildBillingDocProps(
  tenantId: string,
  dteId: string,
  variant: BillingDocVariant,
  opts: BuildBillingDocPropsOptions = {},
): Promise<BillingDocProps> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    include: {
      lines: { orderBy: { lineNumber: "asc" } },
    },
  });
  if (!dte) throw new Error("DTE no encontrado");

  // Cliente CRM (si está vinculado) + contacto Estado de Pago.
  const account = dte.crmAccountId
    ? await prisma.crmAccount.findFirst({
        where: { id: dte.crmAccountId, tenantId },
        include: {
          contactoEstadoPago: true,
          contacts: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
          },
        },
      })
    : null;

  const installation = dte.installationId
    ? await prisma.crmInstallation.findFirst({
        where: { id: dte.installationId, tenantId },
        select: { name: true },
      })
    : null;

  const tenantConfig = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
  });

  const company = await getTenantCompanyConfig(tenantId);
  const colors = await resolveBrandColors(tenantId);

  // Firmantes del tenant: por defecto los activos. Si hay override, filtrar.
  let tenantSigners = await listSigners(tenantId);
  if (opts.signerOverrideIds && opts.signerOverrideIds.length > 0) {
    const set = new Set(opts.signerOverrideIds);
    tenantSigners = tenantSigners.filter((s) => set.has(s.id));
  }

  const tenantSignersWithImages: BillingDocSignerProp[] = await Promise.all(
    tenantSigners.slice(0, 3).map(async (s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      signatureDataUrl: await fetchSignatureDataUrl(s.signatureStorageKey),
    })),
  );

  // Firmantes del cliente: contactos del CrmAccount que firman. Vienen del
  // plan persistido en el draft (estadoPagoRecipientContactIds), o del
  // override explícito del modal de envío. No tienen imagen de firma — solo
  // nombre + cargo + línea para firmar a mano sobre el PDF impreso.
  const clientSignerIds =
    opts.clientSignerContactIdsOverride ??
    (dte.estadoPagoRecipientContactIds ?? []);
  const clientSigners: BillingDocSignerProp[] = [];
  if (clientSignerIds.length > 0 && account) {
    const clientContacts = await prisma.crmContact.findMany({
      where: {
        tenantId,
        accountId: account.id,
        id: { in: clientSignerIds },
      },
    });
    for (const c of clientContacts.slice(0, 3)) {
      clientSigners.push({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`.trim(),
        role: c.roleTitle ?? "Cliente",
        signatureDataUrl: null,
      });
    }
  }

  // Resolver el contacto del destinatario primario con un query separado:
  // el include de `account.contacts` está acotado a `take: 1` (el isPrimary
  // del account) para otros usos, pero el destinatario seleccionado por el
  // usuario puede ser CUALQUIER contacto del account. Si lo buscáramos en
  // `account.contacts` lo perderíamos casi siempre y caeríamos al fallback
  // `contactoEstadoPago`, que es otro contacto distinto.
  const primaryEmailLower = opts.primaryRecipientEmail?.trim().toLowerCase();
  const primaryRecipientContact =
    primaryEmailLower && account
      ? await prisma.crmContact.findFirst({
          where: {
            tenantId,
            accountId: account.id,
            email: { equals: primaryEmailLower, mode: "insensitive" },
          },
        })
      : null;
  const contactoEP =
    primaryRecipientContact ??
    account?.contactoEstadoPago ??
    account?.contacts?.[0] ??
    null;

  // Resolver nombres de instalacion por linea (via cost center). Si hay
  // 2+ instalaciones distintas, computamos installationGroups para
  // subheaders en el PDF. Si todas comparten, dejamos groups=undefined
  // (render plano) y los nombres por linea quedan null.
  const ccIdsPresent = Array.from(
    new Set(
      dte.lines
        .map((l) => l.costCenterId)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const ccNameMap = new Map<string, string>();
  if (ccIdsPresent.length > 0) {
    const ccRows = await prisma.financeCostCenter.findMany({
      where: { tenantId, id: { in: ccIdsPresent } },
      select: { id: true, name: true, installationId: true },
    });
    const installationIds = ccRows
      .map((r) => r.installationId)
      .filter((x): x is string => Boolean(x));
    const installationsByCc = installationIds.length
      ? await prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installationIds } },
          select: { id: true, name: true },
        })
      : [];
    const instNameById = new Map(installationsByCc.map((i) => [i.id, i.name]));
    for (const cc of ccRows) {
      const name =
        (cc.installationId && instNameById.get(cc.installationId)) || cc.name;
      ccNameMap.set(cc.id, name);
    }
  }

  const lineInstallationName = (costCenterId: string | null): string | null => {
    if (!costCenterId) return null;
    return ccNameMap.get(costCenterId) ?? null;
  };

  let installationGroups: BillingDocProps["installationGroups"] = undefined;
  if (ccIdsPresent.length >= 2) {
    const groupsByCc = new Map<
      string,
      { name: string; idx: number[]; subtotal: number }
    >();
    for (let i = 0; i < dte.lines.length; i++) {
      const line = dte.lines[i];
      const key = line.costCenterId ?? "__header__";
      const name =
        key === "__header__"
          ? (installation?.name ?? "Cabecera")
          : (ccNameMap.get(key) ?? "Sin instalacion");
      const existing = groupsByCc.get(key) ?? {
        name,
        idx: [],
        subtotal: 0,
      };
      existing.idx.push(i);
      existing.subtotal += Number(line.netAmount);
      groupsByCc.set(key, existing);
    }
    installationGroups = Array.from(groupsByCc.values()).map((g) => ({
      installationName: g.name,
      lineIndexes: g.idx,
      subtotalNet: g.subtotal,
    }));
  }

  // Header del documento: si hay multi, decimos "Multiples instalaciones".
  const headerInstallationName =
    installationGroups && installationGroups.length >= 2
      ? "Multiples instalaciones"
      : (installation?.name ?? null);

  // Fecha de emisión del DTE (lo que se rotula como "FECHA EMISIÓN").
  const date = new Date(dte.date);

  // Periodo del Estado de Pago: por defecto el mes de emisión, pero si el
  // borrador marca "PREVIOUS" (servicio facturado en arriendo/atrasado), el
  // rótulo del EP refleja el mes anterior a la emisión. Solo aplica al EP.
  const periodoDate = new Date(date);
  if (variant === "ESTADO_DE_PAGO" && dte.estadoPagoPeriodoMode === "PREVIOUS") {
    periodoDate.setUTCMonth(periodoDate.getUTCMonth() - 1);
  }

  // Código verificación: solo se imprime en Estado de Pago. Usa el periodo del
  // EP (no la fecha de emisión) para que el código coincida con el mes rotulado.
  const verifTemplate =
    tenantConfig?.verificationCodeTemplate || "EP-{{year}}{{month}}-{{folio}}";
  const verificationCode = renderVerificationCode(verifTemplate, {
    year: periodoDate.getUTCFullYear(),
    month: String(periodoDate.getUTCMonth() + 1).padStart(2, "0"),
    folio: dte.folio || "DRAFT",
    accountSlug: account ? slugify(account.name) : undefined,
    installationSlug: installation ? slugify(installation.name) : undefined,
  });

  return {
    variant,

    emisor: {
      rut: tenantConfig?.emisorRut ?? company.rut,
      razonSocial: tenantConfig?.emisorRazonSocial ?? company.razonSocial,
      giro: tenantConfig?.emisorGiro ?? null,
      direccion: tenantConfig?.emisorDireccion ?? company.direccion ?? null,
      comuna: tenantConfig?.emisorComuna ?? company.comuna ?? null,
      ciudad: tenantConfig?.emisorCiudad ?? company.ciudad ?? null,
      telefono: tenantConfig?.emisorTelefono ?? company.telefono ?? null,
      email: tenantConfig?.emisorEmail ?? company.emailContact ?? null,
      logoDataUrl:
        logoDataUrlFromConfig(tenantConfig?.logoBase64 ?? null) ??
        company.brandingLogoFull ??
        company.logoUrl ??
        null,
      brandNameUpper: company.brandNameUpper ?? company.razonSocial.toUpperCase(),
    },

    receptor: {
      rut: dte.receiverRut,
      razonSocial: dte.receiverName,
      giro: dte.receiverGiro,
      direccion: dte.receiverDireccion,
      comuna: dte.receiverComuna,
      ciudad: dte.receiverCiudad,
      contactName: contactoEP
        ? `${contactoEP.firstName} ${contactoEP.lastName}`.trim()
        : null,
      contactEmail: contactoEP?.email ?? dte.receiverEmail ?? null,
      contactPhone: contactoEP?.phone ?? null,
    },

    document: {
      folio: dte.folio > 0 ? String(dte.folio) : "—",
      dteType: dte.dteType,
      dteTypeName: DTE_TYPE_NAMES[dte.dteType] ?? `Tipo ${dte.dteType}`,
      dateFormatted: formatDate(date),
      dateIso: date.toISOString().slice(0, 10),
      numeroOrdenContrato: account?.numeroOrdenContrato ?? null,
      installationName: headerInstallationName,
      periodoLabel: periodoLabel(periodoDate),
      verificationCode,
      additionalReferences: (() => {
        const refs = (dte.additionalReferences ?? []) as Array<{
          tipoDocRef?: string;
          folioRef?: string;
          razonRef?: string;
        }>;
        const labelMap: Record<string, string> = {
          "801": "Orden de Compra",
          "802": "Nota de Pedido",
          "803": "Contrato",
          "804": "Resolución",
          HES: "HES",
          GD: "Guía Despacho",
          "52": "Guía Despacho",
        };
        return refs
          .filter((r) => (r.folioRef ?? "").trim().length > 0)
          .map((r) => ({
            label:
              labelMap[r.tipoDocRef ?? ""] ?? `Ref ${r.tipoDocRef ?? ""}`.trim(),
            folio: String(r.folioRef ?? "").trim(),
            reason: (r.razonRef ?? "").trim() || null,
          }));
      })(),
    },

    lines: dte.lines.map((l) => ({
      lineNumber: l.lineNumber,
      itemCode: l.itemCode,
      itemName: l.itemName,
      description: l.description,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPrice: Number(l.unitPrice),
      unitPriceUf: l.unitPriceUf ? Number(l.unitPriceUf) : null,
      discountPct: Number(l.discountPct),
      netAmount: Number(l.netAmount),
      isExempt: l.isExempt,
      estadoPagoMeta: (l.estadoPagoMeta as BillingDocLine["estadoPagoMeta"]) ?? null,
      installationName: lineInstallationName(l.costCenterId),
    })),

    totals: {
      netAmount: Number(dte.netAmount),
      exemptAmount: Number(dte.exemptAmount),
      taxRate: Number(dte.taxRate),
      taxAmount: Number(dte.taxAmount),
      totalAmount: Number(dte.totalAmount),
      currency: dte.currency === "UF" ? "UF" : "CLP",
      ufValueAtIssue: dte.ufValueAtIssue ? Number(dte.ufValueAtIssue) : null,
    },

    signers: { tenant: tenantSignersWithImages, client: clientSigners },

    branding: {
      primary: colors.primary,
      secondary: colors.secondary,
      estadoPagoFooterLegal: tenantConfig?.estadoPagoFooterLegal ?? null,
    },

    notes: dte.notes,

    installationGroups,
  };
}
