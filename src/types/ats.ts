import type { AtsJobEstado, AtsEtapa } from "@prisma/client";

export type { AtsJobEstado, AtsEtapa };

export interface AtsJobPostingFull {
  id: string;
  tenantId: string;
  titulo: string;
  descripcion: string;
  turno: string;
  region: string;
  commune: string | null;
  installationId: string | null;
  rentaMin: number | null;
  rentaMax: number | null;
  vacantes: number;
  requiereOS10: boolean;
  requiereMovilizacion: boolean;
  genero: string | null;
  experienciaMinAnios: number | null;
  funciones: string | null;
  estado: AtsJobEstado;
  jsonLdSlug: string | null;
  expiraAt: string | null;
  notasInternas: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  installation: { id: string; name: string } | null;
  _count: { applications: number };
  channels: AtsChannelSummary[];
}

export interface AtsChannelSummary {
  canal: string;
  estado: string | null;
  activo: boolean;
}

export interface AtsApplicationFull {
  id: string;
  tenantId: string;
  jobPostingId: string;
  guardiaId: string;
  etapa: AtsEtapa;
  matchScore: number | null;
  matchDetalle: Record<string, number> | null;
  fuente: string;
  notasInternas: string | null;
  etapaAt: string;
  createdAt: string;
  updatedAt: string;
  guardia: {
    id: string;
    code: string | null;
    os10: boolean | null;
    os10ExpiresAt: string | null;
    experienciaAnios: number | null;
    turnosDisponibles: string[];
    lifecycleStatus: string;
    persona: {
      firstName: string;
      lastName: string;
      rut: string | null;
      sex: string | null;
      commune: string | null;
      region: string | null;
    };
  };
}

export interface AtsPipelineData {
  POSTULADO: AtsApplicationFull[];
  EN_REVISION: AtsApplicationFull[];
  ENTREVISTA: AtsApplicationFull[];
  OFERTA: AtsApplicationFull[];
  CONTRATADO: AtsApplicationFull[];
  DESCARTADO: AtsApplicationFull[];
}

export interface AtsMatchScoreResult {
  score: number;
  detalle: {
    os10: number;
    distancia: number;
    disponibilidad: number;
    experiencia: number;
    renta: number;
    evaluacion: number;
  };
  califica: boolean;
}
