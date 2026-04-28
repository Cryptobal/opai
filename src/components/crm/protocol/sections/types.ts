/* Tipos compartidos del Protocolo. Mantienen la forma EXACTA del JSON
 * que retorna /api/installations/[id]/protocol — no cambiar sin migrar
 * el backend.
 */

export type ProtocolItem = {
  id: string;
  title: string;
  description: string;
  order: number;
  source?: string;
};

export type ProtocolSection = {
  id: string;
  title: string;
  icon: string;
  order: number;
  portalVisible?: boolean;
  items: ProtocolItem[];
};

export type ProtocolVersion = {
  id: string;
  versionNumber: number;
  status: string;
  publishedAt?: string | null;
};

export type ProtocolData = {
  sections: ProtocolSection[];
  documents?: unknown[];
  latestVersion?: ProtocolVersion | null;
  stats: { sectionCount: number; itemCount: number };
};

export type WizardMode = null | "manual" | "ai" | "pdf";

export const INSTALLATION_TYPES = [
  { value: "condominio", label: "Condominio" },
  { value: "edificio_corporativo", label: "Edificio Corporativo" },
  { value: "mall_retail", label: "Mall / Retail" },
  { value: "bodega_industria", label: "Bodega / Industria" },
  { value: "obra_construccion", label: "Obra en Construcción" },
  { value: "educacional", label: "Educacional" },
] as const;
