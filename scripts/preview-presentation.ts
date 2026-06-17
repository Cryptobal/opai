/**
 * Preview de un solo uso CON DATOS REALES del tenant (logo + clientes), SIN IA.
 *   npx tsx scripts/preview-presentation.ts
 * Genera ./tmp/presentation-preview.pdf
 */
import fs from "fs";
import path from "path";
import { config } from "dotenv";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { prisma } from "../src/lib/prisma";
import { getTenantCompanyConfig } from "../src/lib/tenant-config";
import { getCanonicalSiteUrl } from "../src/lib/emails/site-url";
import { resolveAccountLogo } from "../src/lib/crm/account-logo";
import { renderProposalToBufferFromProps } from "../src/lib/pdf/templates/proposal/render-proposal";
import type { ProposalProps } from "../src/lib/pdf/templates/proposal/build-proposal-props";

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" }, select: { id: true } });
  if (!tenant) throw new Error("tenant gard no encontrado");
  const cfg = await getTenantCompanyConfig(tenant.id);

  console.log("=== LOGOS TENANT ===");
  console.log("brandingLogoWhite:", cfg.brandingLogoWhite || "(vacío)");
  console.log("brandingLogoFull :", cfg.brandingLogoFull || "(vacío)");
  console.log("brandingLogoIcon :", cfg.brandingLogoIcon || "(vacío)");
  console.log("logoUrl          :", cfg.logoUrl || "(vacío)");

  const baseUrl = getCanonicalSiteUrl();
  const abs = (u?: string | null) => (!u ? "" : /^(https?:|data:)/.test(u) ? u : `${baseUrl}${u.startsWith("/") ? "" : "/"}${u}`);
  const providerLogo = abs(cfg.brandingLogoWhite) || abs(cfg.brandingLogoFull) || abs(cfg.logoUrl) || "";
  console.log("providerLogo final:", providerLogo || "(VACÍO → fallback shield+texto)");

  const accounts = await prisma.crmAccount.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, logoUrl: true, notes: true, status: true, isActive: true },
    orderBy: { name: "asc" },
  });
  const isActiveClient = (a: { status: string | null; isActive: boolean }) =>
    a.status === "prospect" ? false : a.status === "client_active" ? true : a.status === "client_inactive" ? false : a.isActive === true;
  const selfNames = new Set([cfg.commercialName, cfg.companyName, cfg.brandNameUpper].filter(Boolean).map((n) => String(n).trim().toLowerCase()));
  const clients = accounts
    .filter(isActiveClient)
    .filter((c) => !selfNames.has(c.name.trim().toLowerCase()))
    .map((c) => ({ name: c.name, logo: resolveAccountLogo(c) ?? null }));
  const withLogo = clients.filter((c) => c.logo);
  console.log(`=== CLIENTES === activos (sin self): ${clients.length} · con logo: ${withLogo.length}`);

  const props: ProposalProps = {
    variant: "institutional",
    companyName: "Tesorería Regional de Antofagasta",
    quotationCode: "",
    proposalDate: new Date().toLocaleDateString("es-CL"),
    contactName: "Carolina Villarroel",
    contactPosition: "Jefa de Administración",
    ai: {
      descripcionBreve: "Organismo público con atención presencial y resguardo de valores en Antofagasta.",
      resumenEjecutivo:
        "La Tesorería Regional opera con alto flujo de público y manejo de documentación y valores sensibles.\nGard Security es un partner de seguridad con foco preventivo, personal acreditado y procesos auditables.\nOperamos con OPAI, nuestra plataforma propietaria desarrollada por LX3.ai.",
      analisisNecesidades: "El sector público enfrenta riesgos de acceso no autorizado y resguardo de personas.",
      sectoresRelevantes: ["Corporativo/Oficinas", "Educación", "Salud y Clínicas"],
    },
    serviceType: "Servicio de seguridad integral",
    installationName: "-",
    installationAddress: "-",
    coverageSchedule: "",
    staffingCount: 0,
    staffingRegime: "",
    supervisionFrequency: "",
    items: [],
    totalNeto: 0,
    totalNetoFormatted: "",
    currency: "CLP",
    paymentTerms: "",
    providerLogo,
    opaiLogo: `${baseUrl}/opai-logo.png`,
    lx3Logo: `${baseUrl}/lx3-logo.png`,
    clientLogos: withLogo.map((c) => abs(c.logo!)),
    portalScreenshots: {},
    companyConfig: {
      commercialName: cfg.commercialName || "Gard Security",
      companyName: cfg.companyName || "",
      brandNameUpper: cfg.brandNameUpper || (cfg.commercialName || "GARD").toUpperCase(),
      website: cfg.website || "",
      phone: cfg.phone || "",
      email: cfg.email || "",
      brandingLogoWhite: abs(cfg.brandingLogoWhite) || undefined,
      brandingLogoFull: abs(cfg.brandingLogoFull) || undefined,
      brandingLogoIcon: abs(cfg.brandingLogoIcon) || undefined,
    },
    clientLogosWithNames: clients.map((c) => ({ name: c.name, url: c.logo ? abs(c.logo) : "" })),
    companyStats: {
      yearsInOperation: cfg.proposalYearsInOperation || "12+",
      activeGuards: cfg.proposalActiveGuards || "850+",
      protectedFacilities: cfg.proposalProtectedFacilities || "120+",
      regionsCount: cfg.proposalRegionsCount || "6",
    },
    proposalMetrics: [
      { value: "98%", label: "Cumplimiento de rondas" },
      { value: "-40%", label: "Reducción de incidentes" },
      { value: "4.8", label: "Satisfacción (de 5.0)" },
    ],
    regimeExplanation: "",
    includedItems: [],
  };

  const buffer = await renderProposalToBufferFromProps(props);
  const outDir = path.resolve(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "presentation-preview.pdf");
  fs.writeFileSync(outPath, buffer);
  console.log("PDF generado:", outPath);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
