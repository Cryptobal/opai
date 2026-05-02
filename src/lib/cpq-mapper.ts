/**
 * @deprecated DESDE: 2026-04-16
 *
 * Este módulo forma parte del Sistema de Presentación Comercial de 29 secciones,
 * que NO se muestra al cliente final. El flujo activo de envío al cliente usa
 * el Portal del Cliente (ver `sendQuoteToPortal()` en
 * `src/modules/cpq/send/send-quote-to-portal.ts`).
 *
 * NO USAR EN CÓDIGO NUEVO. Este archivo será eliminado después de
 * 2026-06-15 una vez confirmada estabilidad.
 *
 * Ver: src/lib/_deprecated/README.md
 */

/**
 * CPQ Data Mapper
 *
 * Convierte datos internos del módulo CPQ al payload usado por
 * `prisma.presentation.clientData` cuando se invita al cliente al portal.
 *
 * Requiere que el caller pase un TenantCompanyConfig (obtenido con
 * getTenantCompanyConfig(tenantId)) para que todos los valores de
 * contacto, logos y CTA sean dinámicos por tenant.
 */

import type { TenantCompanyConfig } from "@/lib/tenant-config";

interface CpqMapperInput {
  /** Valor UF para conversión CLP→UF cuando currency es UF. Si no se provee y currency=UF, los valores se pasan tal cual (CLP). */
  ufValue?: number;
  /** Si false, excluye s23_propuesta_economica (para propuesta técnica / presentación comercial sin valores económicos). Default: true */
  includePricing?: boolean;
  quote: {
    id: string;
    code: string;
    clientName?: string | null;
    validUntil?: Date | string | null;
    notes?: string | null;
    aiDescription?: string | null;
    serviceDetail?: string | null;
    currency?: string;
  };
  positions: Array<{
    id: string;
    customName?: string | null;
    puestoTrabajo?: { name: string } | null;
    numGuards: number;
    numPuestos?: number;
    startTime?: string | null;
    endTime?: string | null;
    weekdays?: string[];
    monthlyPositionCost: unknown;
  }>;
  account?: {
    name: string;
    logoUrl?: string | null;
    companyDescription?: string;
    industry?: string | null;
    segment?: string | null;
  } | null;
  deal?: {
    title: string;
  } | null;
  siteUrl?: string;
  contact?: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    roleTitle?: string | null;
  } | null;
  installation?: {
    name: string;
    address?: string | null;
    city?: string | null;
    commune?: string | null;
  } | null;
  salePriceMonthly: number;
  positionSalePrices: Map<string, number>;
  templateId?: string;
  additionalLines?: Array<{
    nombre: string;
    descripcion?: string | null;
    precio: number;
    orden?: number;
  }>;
  totalAdditionalLines?: number;
}

import { clpToUf } from "@/lib/uf";

const WEEKDAY_ORDER = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function formatWeekdaysForDisplay(weekdays: string[] | null | undefined): string {
  if (!weekdays?.length) return "—";
  const order = new Map(WEEKDAY_ORDER.map((d, i) => [d, i]));
  const sorted = [...weekdays].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  if (sorted.length === 7) return "Lun-Dom";
  if (sorted.length === 5 && sorted[0] === "Lun" && sorted[4] === "Vie") return "Lun-Vie";
  if (sorted.length === 2 && sorted[0] === "Sáb" && sorted[1] === "Dom") return "Sáb-Dom";
  if (sorted.length === 3 && sorted[0] === "Vie" && sorted[2] === "Dom") return "Vie-Dom";
  return sorted.join(", ");
}

/**
 * Construye el payload desde cero con datos reales + defaults del tenant.
 * Cuando currency es UF y se provee ufValue, convierte unit_price/subtotal/total de CLP a UF.
 *
 * @param tenantCfg - Configuración de empresa del tenant (getTenantCompanyConfig)
 */
export function mapCpqDataToPresentation(
  input: CpqMapperInput,
  sessionId: string,
  tenantCfg: TenantCompanyConfig,
  templateSlug: string = "commercial"
) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[DEPRECATED] mapCpqDataToPresentation: el contenido de las 29 secciones no se muestra al cliente. ' +
      'Solo se preserva por compatibilidad con el modelo Presentation. ' +
      'Ver src/lib/_deprecated/README.md'
    );
  }
  const { quote, positions, account, deal, contact, installation, ufValue, siteUrl, includePricing = true } = input;

  const companyName = account?.name || quote.clientName || "Cliente";
  const companyLogoUrl =
    account?.logoUrl && siteUrl
      ? account.logoUrl.startsWith("/")
        ? `${siteUrl}${account.logoUrl}`
        : account.logoUrl
      : null;
  const explicitCompanyDescription = (account?.companyDescription || "").trim();
  const fallbackFromBusinessContext = [account?.industry, account?.segment]
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .join(" · ");
  const companyDescription =
    explicitCompanyDescription ||
    (fallbackFromBusinessContext ? `Cliente del rubro ${fallbackFromBusinessContext}.` : "");
  const contactFullName = contact
    ? `${contact.firstName} ${contact.lastName}`.trim()
    : "";
  const validUntilStr = quote.validUntil
    ? new Date(quote.validUntil).toLocaleDateString("es-CL", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  const dateStr = new Date().toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalGuards = positions.reduce(
    (sum, p) => sum + p.numGuards * (p.numPuestos || 1),
    0
  );
  const currency = (quote.currency || "CLP") as "CLP" | "UF" | "USD";
  const shouldConvertToUf = currency === "UF" && ufValue != null && ufValue > 0;

  const toDisplayValue = (clp: number) =>
    shouldConvertToUf ? clpToUf(clp, ufValue!) : clp;

  return {
    // Metadatos
    id: sessionId,
    template_id: templateSlug,
    theme: "executive",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    // Contexto CRM (para mostrar en preview y header)
    _dealName: deal?.title || "",
    _installationName: installation?.name || "",

    // Branding del tenant
    _tenantBrand: {
      brandNameUpper: tenantCfg.brandNameUpper,
      commercialName: tenantCfg.commercialName,
      website: tenantCfg.website,
    },

    // Datos del cliente - 100% del CPQ
    client: {
      company_name: companyName,
      company_description: companyDescription,
      company_logo_url: companyLogoUrl,
      contact_name: contactFullName,
      contact_first_name: contact?.firstName || "",
      contact_last_name: contact?.lastName || "",
      contact_title: contact?.roleTitle || "",
      contact_email: contact?.email || "",
      contact_phone: contact?.phone || "",
      address: installation?.address || "",
      city: installation?.city || "",
    },

    // Cotización - 100% del CPQ
    quote: {
      number: quote.code,
      date: dateStr,
      valid_until: validUntilStr,
      subject: `Propuesta de Servicio de Seguridad - ${companyName}`,
      description: (quote.aiDescription as string) || "",
      total: input.salePriceMonthly,
      subtotal: input.salePriceMonthly,
      tax: 0,
      currency,
    },

    // Servicio - datos reales del CPQ
    service: {
      scope_summary: `Servicio de seguridad para ${companyName}${installation ? ` en ${installation.name}` : ""}, con ${totalGuards} guardias.`,
      sites: installation
        ? [
            {
              name: installation.name,
              address: installation.address || "",
              comuna: installation.commune || undefined,
            },
          ]
        : [],
      positions: positions.map((pos) => ({
        title: pos.customName || pos.puestoTrabajo?.name || "Puesto",
        schedule: `${pos.startTime || "-"} - ${pos.endTime || "-"}`,
        shift_type: (pos.weekdays?.length ?? 7) >= 6 ? "6x1" : "5x2",
        quantity: pos.numGuards * (pos.numPuestos || 1),
      })),
    },

    // Assets - defaults del tenant (logo dinámico, fotos genéricas)
    assets: {
      ...TENANT_ASSETS_DEFAULTS,
      logo: tenantCfg.logoUrl || TENANT_ASSETS_DEFAULTS.logo,
    },

    // CTA - datos del tenant
    cta: {
      meeting_link: "https://calendar.app.google/MfyKXvYxURJSnUBe9",
      whatsapp_link: tenantCfg.whatsappLink,
      phone: contact?.phone || tenantCfg.phone,
      email: contact?.email || tenantCfg.email,
    },

    // Contacto comercial del tenant
    contact: {
      name: contactFullName || "Equipo Comercial",
      email: contact?.email || tenantCfg.email,
      phone: contact?.phone || tenantCfg.phone,
      position: "Gerente Comercial",
    },

    // Secciones - defaults genéricos del tenant + datos CPQ donde corresponda
    sections: {
      s01_hero: {
        headline: "Seguridad privada diseñada para continuidad operacional",
        subheadline:
          "Guardias profesionales + supervisión activa + control en tiempo real",
        microcopy:
          "Protegemos personas, activos y procesos críticos en entornos empresariales exigentes.",
        personalization: `Propuesta para ${companyName} — ${quote.code}`,
        cta_primary_text: "Agendar visita técnica sin costo",
        cta_secondary_text: "Solicitar propuesta directa",
        background_image: "/guardia_hero.webp",
        kpi_overlay: { value: "99,5%", label: "Cobertura de turnos" },
      },

      // S23 - Propuesta Económica (si includePricing=false: placeholder vacío para propuesta técnica)
      s23_propuesta_economica: includePricing
        ? {
            serviceDetail: (quote.serviceDetail as string) || undefined,
            pricing: {
              items: [
                  ...positions.map((pos) => {
                    const salePriceClp =
                      input.positionSalePrices.get(pos.id) ??
                      Number(pos.monthlyPositionCost);
                    const numPuestos = Math.max(1, Number(pos.numPuestos || 1));
                    const unitPriceClp = salePriceClp / numPuestos;
                    const displayPrice = toDisplayValue(salePriceClp);
                    const displayUnitPrice = toDisplayValue(unitPriceClp);
                    return {
                      name: pos.customName || pos.puestoTrabajo?.name || "Puesto",
                      description: `${pos.numGuards} guardia(s) x ${pos.numPuestos || 1} puesto(s) · ${formatWeekdaysForDisplay(pos.weekdays)} · ${pos.startTime || "-"} a ${pos.endTime || "-"}`,
                      quantity: numPuestos,
                      unit_price: displayUnitPrice,
                      subtotal: displayPrice,
                      currency,
                    };
                  }),
                  ...(input.additionalLines || [])
                    .filter((l) => l.nombre && Number(l.precio) > 0)
                    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                    .map((l) => ({
                      name: l.nombre,
                      description: l.descripcion || "Servicio adicional",
                      quantity: 1,
                      unit_price: toDisplayValue(Number(l.precio)),
                      subtotal: toDisplayValue(Number(l.precio)),
                      currency,
                    })),
                ],
                subtotal: toDisplayValue(input.salePriceMonthly + (input.totalAdditionalLines ?? 0)),
                tax: 0,
                total: toDisplayValue(input.salePriceMonthly + (input.totalAdditionalLines ?? 0)),
                currency,
                payment_terms: "Mensual, contraentrega de factura",
                adjustment_terms: "Reajuste anual: 70% IPC + 30% IMO",
                billing_frequency: "monthly" as const,
                notes: [
                  currency === "UF" ? "Valor mensual expresado en UF" : "Valor mensual en pesos chilenos",
                  "Incluye seguros y cumplimiento legal",
                  "Mínimo 12 meses de contrato",
                  "Equipamiento incluido (radios, linternas)",
                ],
              },
            }
        : {
            serviceDetail: "Los valores económicos están disponibles en tu portal privado.",
            pricing: {
              items: [],
              subtotal: 0,
              tax: 0,
              total: 0,
              currency,
              payment_terms: "Mensual, contraentrega de factura",
              notes: ["Accede a tu portal con tu correo y PIN para ver la propuesta económica completa."],
            },
          },
    },
  };
}

// ─── Defaults genéricos de presentación (sin datos de clientes ficticios) ───

const TENANT_ASSETS_DEFAULTS = {
  logo: "",
  guard_photos: [
    "/guardia_hero.webp",
    "/guardia_entrada.webp",
    "/guardia_recepcion.webp",
    "/guardia_conserje.jpeg",
    "/guardia_caseta.jpeg",
    "/guardia_cims.jpg",
    "/guardia_cims_1.jpg",
    "/guardia_conserje_1.jpeg",
  ],
  client_logos: [
    "/clientes_Polpaico.png",
    "/clientes_International Paper.png",
    "/clientes_Tritec.webp",
    "/clientes_Sparta.webp",
    "/clientes_Tattersall.png",
    "/clientes_Transmat.webp",
    "/clientes_Zerando.webp",
    "/clientes_bbosch.webp",
    "/clientes_Delegacion.png",
    "/clientes_Dhemax.png",
    "/clientes_Embajada Brasil.png",
    "/clientes_Emecar.jpg",
    "/clientes_Forestal Santa Blanca.png",
    "/clientes_GL Events.png",
    "/clientes_Newtree.png",
    "/clientes_eCars.png",
  ],
  hero_image: "/hero_guardias.webp",
  os10_qr_url: "/QR OS10.png",
};

