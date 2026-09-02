import { BRAND_PROFILES } from "@/lib/camaras/brand-profiles";
import type { CameraBrand } from "@/lib/camaras/types";

export const BRAND_OPTIONS: { id: CameraBrand; label: string }[] = [
  { id: "hikvision", label: "Hikvision" },
  { id: "dahua", label: "Dahua" },
  { id: "uniview", label: "Uniview" },
  { id: "tplink_vigi", label: "TP-Link VIGI" },
  { id: "hanwha", label: "Hanwha" },
  { id: "axis", label: "Axis" },
  { id: "generic", label: "Otra / genérica" },
];

export function brandPortHint(brand: CameraBrand): string {
  const p = BRAND_PROFILES[brand];
  return `RTSP ${p.rtspPort} · ONVIF ${p.onvifPort}`;
}
