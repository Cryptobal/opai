export type AccountOption = {
  id: string;
  name: string;
  rut: string | null;
  type?: string;
};

export type InstallationOption = {
  id: string;
  name: string;
  address: string | null;
  commune: string | null;
  lat: number | null;
  lng: number | null;
};

export type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  roleTitle: string | null;
  email: string | null;
};

export type TeamMember = { userId: string; name: string; connected: boolean };

export const VISIT_TYPES = [
  { id: "tecnica", label: "Técnica" },
  { id: "cliente", label: "Cliente" },
  { id: "supervision", label: "Supervisión" },
  { id: "otra", label: "Otra" },
] as const;

export type VisitType = (typeof VISIT_TYPES)[number]["id"];

export const DURATIONS = [
  { min: 30, label: "30 min" },
  { min: 60, label: "1 h" },
  { min: 90, label: "1 h 30" },
  { min: 120, label: "2 h" },
  { min: 240, label: "Media jornada" },
] as const;

/** Link a Google Maps: por geo si existe, si no por dirección urlencoded. */
export function mapsHref(inst: {
  lat: number | null;
  address: string | null;
  lng: number | null;
  commune: string | null;
}): string | null {
  if (inst.lat != null && inst.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${inst.lat},${inst.lng}`;
  }
  const q = [inst.address, inst.commune].filter(Boolean).join(", ").trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
