/**
 * Types compartidos del módulo VRA.
 */

export type VraSeverity = "critical" | "high" | "medium" | "low";

export type VraInstallationContext = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  commune: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  // Datos derivados:
  clientName: string | null;
  guardiasActivos: number;
  turnos: { turno: string; cantidad: number }[];
};

export type VraFindingContext = {
  id: string;
  category: string | null;
  severity: string | null;
  description: string;
  photoUrl: string | null;
  occurrenceCount: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
};

export type VraPhotoContext = {
  id: string;
  storageKey: string;
  publicUrl: string;
  takenAt: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  categoryName: string | null;
  // Enriquecido por Fase 1 (vision analysis):
  aiAnalysis?: VraPhotoAnalysis;
};

export type VraPhotoAnalysis = {
  technicalDescription: string;
  observableVulnerability: string | null;
  estimatedSeverity: VraSeverity;
  suggestedVulnerabilityKeys: string[];
  visibleSector: string | null;
};

export type VraSectionGenerationInput = {
  installation: VraInstallationContext;
  findings: VraFindingContext[];
  photos: VraPhotoContext[];
  previousSections: Record<string, unknown>;
  template: {
    key: string;
    title: string;
    description: string;
    aiPromptHint: string | null;
    outputType: string;
  };
};

export type VraSectionContent = {
  // Bloques que se renderizan según outputType:
  narrative?: string;
  bullets?: string[];
  table?: { headers: string[]; rows: (string | { value: string; severity?: VraSeverity })[][] };
  vulnerabilities?: VraVulnerability[];
  recommendations?: VraRecommendation[];
  riskMatrix?: { distribution: { critical: number; high: number; medium: number; low: number } };
  heatMap?: VraHeatMapCell[];
  roadmap?: VraRoadmapPhase[];
  photoGallery?: VraPhotoGalleryItem[];
  metadata?: Record<string, string>;
  customBlocks?: unknown[];
};

export type VraVulnerability = {
  code: string; // V-01
  title: string;
  description: string;
  sectorOrSystem: string;
  probability: "Alta" | "Media-Alta" | "Media" | "Baja";
  impact: "Alto" | "Medio-Alto" | "Medio" | "Bajo";
  finalRisk: VraSeverity;
  aggravatingFactors: string;
  affectedSystems: string[];
};

export type VraRecommendation = {
  code: string; // R-01
  title: string;
  priority: "Inmediata" | "Alta" | "Media" | "Baja";
  termDays: { from: number; to: number };
  investmentLevel: "Alta" | "Media" | "Baja";
  investmentNote: string;
  action: string;
  justification: string;
  kpi: string;
  linkedVulnerabilities: string[];
};

export type VraHeatMapCell = {
  probability: "Casi Cierto" | "Probable" | "Posible" | "Improbable";
  impact: "Insignificante" | "Menor" | "Moderado" | "Mayor";
  vulnerabilityCodes: string[];
};

export type VraRoadmapPhase = {
  phase: 1 | 2 | 3 | 4;
  title: string;
  termDays: { from: number; to: number };
  items: { code: string; description: string }[];
  outcome: string;
};

export type VraPhotoGalleryItem = {
  code: string; // E-01
  photoId: string;
  publicUrl: string;
  severity: VraSeverity;
  title: string;
  technicalObservation: string;
  linkedVulnerabilityCodes: string[];
};

export type VraReportMetadata = {
  installationName: string;
  clientName: string | null;
  generatedAt: string;
  visitId: string | null;
  version: number;
  riskLevel: VraSeverity;
  riskDistribution: { critical: number; high: number; medium: number; low: number };
};
