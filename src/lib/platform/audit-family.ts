export const AUDIT_FAMILIES = [
  "plan",
  "price",
  "lifecycle",
  "impersonation",
  "modules",
  "suspension",
  "catalog",
  "settings",
  "billing",
  "tenant",
  "other",
] as const;

export type AuditFamily = (typeof AUDIT_FAMILIES)[number];

export const AUDIT_FAMILY_LABEL: Record<AuditFamily, string> = {
  plan: "Plan",
  price: "Precio",
  lifecycle: "Ciclo de vida",
  impersonation: "Impersonación",
  modules: "Módulos",
  suspension: "Suspensión",
  catalog: "Catálogo",
  settings: "Configuración",
  billing: "Facturación",
  tenant: "Tenant",
  other: "Otro",
};

/** Variantes Tag del prototipo (FAMILY_V). */
export const AUDIT_FAMILY_VARIANT: Record<AuditFamily, "info" | "warn" | "ok" | "danger" | "brand" | "neutral"> = {
  plan: "info",
  price: "warn",
  lifecycle: "brand",
  impersonation: "ok",
  modules: "info",
  suspension: "danger",
  catalog: "neutral",
  settings: "neutral",
  billing: "warn",
  tenant: "neutral",
  other: "neutral",
};

export function auditFamily(action: string): AuditFamily {
  const a = action.toLowerCase();
  if (a.startsWith("lifecycle.")) return "lifecycle";
  if (a.includes("impersonat")) return "impersonation";
  if (a.includes("suspend")) return "suspension";
  if (a.startsWith("plan.price") || a.includes("price_override") || a.startsWith("commercial.")) {
    return "price";
  }
  if (a.startsWith("addon.") || a.includes("module")) return "modules";
  if (a.startsWith("plan.")) return "plan";
  if (a.startsWith("catalog.")) return "catalog";
  if (a.startsWith("settings.")) return "settings";
  if (a.startsWith("billing.")) return "billing";
  if (a.startsWith("tenant.")) return "tenant";
  return "other";
}

export function auditFamilyPrefixFilter(family: AuditFamily): { startsWith: string } | null {
  switch (family) {
    case "lifecycle":
      return { startsWith: "lifecycle." };
    case "plan":
      return { startsWith: "plan." };
    case "catalog":
      return { startsWith: "catalog." };
    case "settings":
      return { startsWith: "settings." };
    case "billing":
      return { startsWith: "billing." };
    case "tenant":
      return { startsWith: "tenant." };
    default:
      return null;
  }
}
