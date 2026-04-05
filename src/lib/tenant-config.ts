/**
 * Tenant Company Configuration
 *
 * Helper centralizado para leer la configuración de empresa por tenant.
 * Lee desde la tabla Setting con cache de 5 min para no repetir queries.
 *
 * Uso:
 *   const cfg = await getTenantCompanyConfig(tenantId);
 *   cfg.companyName     // "Mi Empresa SpA"
 *   cfg.commercialName  // "Mi Empresa Security"
 *   cfg.email           // "comercial@miempresa.cl"
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TenantCompanyConfig {
  /* Datos Generales */
  razonSocial: string;
  rut: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  telefono: string;
  repLegalNombre: string;
  repLegalRut: string;

  /* Nombre comercial / branding */
  companyName: string;       // razón social corta: "Mi Empresa SpA"
  commercialName: string;    // marca comercial: "Mi Empresa Security"
  brandNameUpper: string;    // para headers: "MIEMPRESA"
  website: string;           // "www.miempresa.cl"
  logoUrl: string;           // URL del logo

  /* Branding / Imagen Corporativa */
  brandingLogoFull: string;      // Logo completo horizontal
  brandingLogoIcon: string;      // Ícono/isotipo
  brandingLogoWhite: string;     // Logo para fondos oscuros
  brandingLogoDark: string;      // Logo para fondos claros
  brandingFavicon: string;       // Favicon URL
  brandingPrimaryColor: string;  // Color principal (#0a1628)
  brandingSecondaryColor: string;// Color secundario (#0d9488)
  brandingAccentColor: string;   // Color accent (#2dd4bf)
  brandingAppName: string;       // Nombre de la app ("OPAI")
  brandingTagline: string;       // Subtítulo ("Plataforma de Operaciones")

  /* Contacto comercial */
  email: string;             // comercial@miempresa.cl
  emailOps: string;          // operaciones@miempresa.cl
  emailContact: string;      // contacto@miempresa.cl
  phone: string;             // "+56 9 1234 5678"
  phoneRaw: string;          // "56912345678" (sin formato, para wa.me links)
  whatsappLink: string;      // "https://wa.me/56912345678"

  /* Email config */
  emailFrom: string;         // "OPAI <noreply@miempresa.cl>"
  emailFromName: string;     // "OPAI"
  emailFromAddress: string;  // "noreply@miempresa.cl"
  emailReplyTo: string;      // "comercial@miempresa.cl"
}

/* ------------------------------------------------------------------ */
/*  Defaults (fallback si no hay valores en BD)                        */
/* ------------------------------------------------------------------ */

const DEFAULTS: TenantCompanyConfig = {
  razonSocial: "Empresa Sin Configurar",
  rut: "00.000.000-0",
  direccion: "",
  comuna: "",
  ciudad: "",
  telefono: "",
  repLegalNombre: "",
  repLegalRut: "",

  companyName: "Mi Empresa",
  commercialName: "Mi Empresa",
  brandNameUpper: "MI EMPRESA",
  website: "",
  logoUrl: "",

  brandingLogoFull: "",
  brandingLogoIcon: "",
  brandingLogoWhite: "",
  brandingLogoDark: "",
  brandingFavicon: "",
  brandingPrimaryColor: "#0056E0",
  brandingSecondaryColor: "#1DB990",
  brandingAccentColor: "#FF6B35",
  brandingAppName: "OPAI",
  brandingTagline: "Plataforma de Gestión de Seguridad",

  email: "",
  emailOps: "",
  emailContact: "",
  phone: "",
  phoneRaw: "",
  whatsappLink: "",

  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || "",
  emailFromName: "OPAI",
  emailFrom: process.env.EMAIL_FROM || "OPAI <noreply@opai.cl>",
  emailReplyTo: process.env.EMAIL_REPLY_TO || "",
};

/* ------------------------------------------------------------------ */
/*  Setting key → config field mapping                                 */
/* ------------------------------------------------------------------ */

/**
 * Maps Setting keys (empresa.*) to TenantCompanyConfig fields.
 * Keys that exist in the DB will override the defaults.
 */
const KEY_MAP: Record<string, keyof TenantCompanyConfig> = {
  "empresa.razonSocial": "razonSocial",
  "empresa.rut": "rut",
  "empresa.direccion": "direccion",
  "empresa.comuna": "comuna",
  "empresa.ciudad": "ciudad",
  "empresa.telefono": "telefono",
  "empresa.repLegalNombre": "repLegalNombre",
  "empresa.repLegalRut": "repLegalRut",

  "empresa.companyName": "companyName",
  "empresa.commercialName": "commercialName",
  "empresa.brandNameUpper": "brandNameUpper",
  "empresa.website": "website",
  "empresa.logoUrl": "logoUrl",

  "empresa.branding.logoFull": "brandingLogoFull",
  "empresa.branding.logoIcon": "brandingLogoIcon",
  "empresa.branding.logoWhite": "brandingLogoWhite",
  "empresa.branding.logoDark": "brandingLogoDark",
  "empresa.branding.favicon": "brandingFavicon",
  "empresa.branding.primaryColor": "brandingPrimaryColor",
  "empresa.branding.secondaryColor": "brandingSecondaryColor",
  "empresa.branding.accentColor": "brandingAccentColor",
  "empresa.branding.appName": "brandingAppName",
  "empresa.branding.tagline": "brandingTagline",

  "empresa.email": "email",
  "empresa.emailOps": "emailOps",
  "empresa.emailContact": "emailContact",
  "empresa.phone": "phone",
  "empresa.phoneRaw": "phoneRaw",
  "empresa.whatsappLink": "whatsappLink",

  "empresa.emailFrom": "emailFromAddress",
  "empresa.emailFromName": "emailFromName",
  "empresa.emailReplyTo": "emailReplyTo",
};

const ALL_KEYS = Object.keys(KEY_MAP);

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { config: TenantCompanyConfig; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function clearTenantCompanyConfigCache(tenantId?: string): void {
  if (tenantId) {
    cache.delete(tenantId);
  } else {
    cache.clear();
  }
}

/* ------------------------------------------------------------------ */
/*  Main function                                                      */
/* ------------------------------------------------------------------ */

/**
 * Obtiene la configuración completa de la empresa para un tenant.
 * Lee de la tabla Setting, con cache de 5 minutos.
 * Si no hay datos en BD, usa los defaults hardcodeados (Gard).
 */
export async function getTenantCompanyConfig(
  tenantId: string,
): Promise<TenantCompanyConfig> {
  // Check cache
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.config;

  // Start from defaults
  const config: TenantCompanyConfig = { ...DEFAULTS };

  try {
    const { prisma } = await import("@/lib/prisma");

    // Try new-format keys first: empresa:<tenantId>:empresa.xxx
    const newKeys = ALL_KEYS.map((k) => `empresa:${tenantId}:${k}`);
    let settings = await prisma.setting.findMany({
      where: { tenantId, key: { in: newKeys } },
    });

    // Fallback to old-format keys: empresa.xxx
    if (settings.length === 0) {
      settings = await prisma.setting.findMany({
        where: { tenantId, key: { in: ALL_KEYS } },
      });
    }

    // Apply settings to config
    for (const s of settings) {
      const shortKey = s.key.includes(":")
        ? s.key.replace(`empresa:${tenantId}:`, "")
        : s.key;
      const field = KEY_MAP[shortKey];
      if (field && s.value) {
        (config as unknown as Record<string, string>)[field] = s.value;
      }
    }

    // Derived fields: rebuild emailFrom from parts
    if (config.emailFromAddress && config.emailFromName) {
      config.emailFrom = `${config.emailFromName} <${config.emailFromAddress}>`;
    } else if (config.emailFromAddress) {
      config.emailFrom = config.emailFromAddress;
    }

    // Derive companyName from razonSocial if companyName not explicitly set
    const hasExplicitCompanyName = settings.some((s) => {
      const k = s.key.includes(":") ? s.key.replace(`empresa:${tenantId}:`, "") : s.key;
      return k === "empresa.companyName";
    });
    if (!hasExplicitCompanyName && config.razonSocial !== DEFAULTS.razonSocial) {
      config.companyName = config.razonSocial;
    }

    // Derive whatsappLink from phoneRaw if whatsappLink not explicitly set
    const hasExplicitWa = settings.some((s) => {
      const k = s.key.includes(":") ? s.key.replace(`empresa:${tenantId}:`, "") : s.key;
      return k === "empresa.whatsappLink";
    });
    if (!hasExplicitWa && config.phoneRaw !== DEFAULTS.phoneRaw) {
      config.whatsappLink = `https://wa.me/${config.phoneRaw}`;
    }
  } catch (err) {
    console.error("[TENANT_CONFIG] Error loading config for tenant", tenantId, err);
    // Return defaults on error
  }

  cache.set(tenantId, { config, ts: Date.now() });
  return config;
}
