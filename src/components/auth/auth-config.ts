export const PORTAL_CONFIG = {
  terreno: {
    id: "terreno",
    label: "Terreno",
    name: "Opai Terreno",
    subtitle: "Dispositivo en instalación",
    accent: "#f59e0b",
    accentRgb: "245, 158, 11",
    href: "/portal/terreno",
  },
  personas: {
    id: "personas",
    label: "Personas",
    name: "Opai Personas",
    subtitle: "Guardia · Cliente",
    accent: "#2dd4bf",
    accentRgb: "45, 212, 191",
    href: "/portal/personas",
  },
  opai: {
    id: "opai",
    label: "OPAI ERP",
    name: "OPAI",
    subtitle: "Sistema ERP Completo",
    accent: "#f43f5e",
    accentRgb: "244, 63, 94",
    href: "/opai/login",
  },
  // ── Legacy portal IDs (still used by the sub-portals' own login screens) ──
  // The top AuthNavBar no longer shows these as separate tabs; they all roll up
  // into the three hubs above. Keep the entries so existing <AuthShell portalId="..."/>
  // references keep compiling.
  guardia: {
    id: "guardia",
    label: "Guardia",
    name: "Portal Guardia",
    subtitle: "Novedades y asistencia",
    accent: "#2dd4bf",
    accentRgb: "45, 212, 191",
    href: "/portal/guardia",
  },
  rondas: {
    id: "rondas",
    label: "Rondas",
    name: "Portal Rondas",
    subtitle: "Checkpoints y registro",
    accent: "#10b981",
    accentRgb: "16, 185, 129",
    href: "/portal/rondas",
  },
  cliente: {
    id: "cliente",
    label: "Cliente",
    name: "Cliente",
    subtitle: "Portal de Servicios",
    accent: "#3b82f6",
    accentRgb: "59, 130, 246",
    href: "/portal/cliente",
  },
  acceso: {
    id: "acceso",
    label: "Acceso",
    name: "Control de Acceso",
    subtitle: "Dispositivo de ingreso",
    accent: "#f59e0b",
    accentRgb: "245, 158, 11",
    href: "/portal/acceso",
  },
  marcacion: {
    id: "marcacion",
    label: "Marcación",
    name: "Portal Marcación",
    subtitle: "Control de asistencia",
    accent: "#f97316",
    accentRgb: "249, 115, 22",
    href: "/portal/marcacion",
  },
} as const;

export type PortalId = keyof typeof PORTAL_CONFIG;

/**
 * Maps any portal ID to its top-level hub. Used by AuthNavBar so that
 * sub-portals highlight the correct parent tab.
 */
export type HubId = "terreno" | "personas" | "opai";

export function getHubForPortal(portalId: PortalId | "home"): HubId | "home" {
  if (portalId === "home") return "home";
  if (portalId === "terreno" || portalId === "marcacion" || portalId === "rondas" || portalId === "acceso") {
    return "terreno";
  }
  if (portalId === "personas" || portalId === "guardia" || portalId === "cliente") {
    return "personas";
  }
  return "opai";
}
