import type { TagVariant } from "@/components/opai-ds";

export function cameraStatusLabel(status: string): string {
  if (status === "online") return "En línea";
  if (status === "offline") return "Offline";
  if (status === "error") return "Error";
  return "Sin probar";
}

export function cameraStatusVariant(status: string): TagVariant {
  if (status === "online") return "ok";
  if (status === "offline") return "danger";
  if (status === "error") return "warn";
  return "neutral";
}

export const BRAND_LABELS: Record<string, string> = {
  hikvision: "Hikvision",
  dahua: "Dahua",
  uniview: "Uniview",
  tplink_vigi: "TP-Link VIGI",
  hanwha: "Hanwha",
  axis: "Axis",
  generic: "Genérica",
};
