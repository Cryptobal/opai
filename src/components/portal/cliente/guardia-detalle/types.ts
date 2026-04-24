export type DocEstado =
  | "vigente"
  | "por_vencer"
  | "vencido"
  | "pendiente"
  | "no_aplica";

export interface GuardiaDetalleInfo {
  id: string;
  nombre: string;
  iniciales: string;
  hiredAt: string | null;
  antiguedadMeses: number;
  installation: {
    id: string;
    name: string;
    address: string | null;
    commune: string | null;
  } | null;
  turnoActual: string | null;
  faceIdPhotoUrl: string | null;
  os10: { estado: DocEstado; expiresAt: string | null };
  lifecycleStatus: string;
}

export interface Documento {
  tipo: string;
  estado: DocEstado;
  expiresAt: string | null;
  issuedAt: string | null;
  fileUrl: string | null;
}

export interface ExamenProtocolo {
  id: string;
  examenTitulo: string;
  examenType: string;
  estado: "aprobado" | "reprobado" | "pendiente" | "expirado";
  score: number | null;
  passingScore: number | null;
  attemptNumber: number;
  completedAt: string | null;
  timeTakenSecs: number | null;
}

export interface Psicologico {
  tieneEvaluacion: boolean;
  band: "ALTO" | "MEDIO" | "BAJO" | null;
  scoredAt: string | null;
  revisadoPorPsicologo: boolean;
}

export interface Supervision {
  visitId: string;
  visitDate: string | null;
  supervisorName: string;
  presentationScore: number | null;
  orderScore: number | null;
  protocolScore: number | null;
  observation: string | null;
  isReinforcement: boolean;
}

export interface Desempeno {
  trustScore: number | null;
  nivel: string | null;
  asistenciaUltimos30Dias: number;
  rondasCompletadasUltimos30Dias: number;
  incidentesUltimos30Dias: number;
}

export interface HistorialEvento {
  eventType: string;
  createdAt: string;
  summary: string;
}

export interface GuardiaDetalle {
  info: GuardiaDetalleInfo;
  documentos: Documento[];
  examenesProtocolos: ExamenProtocolo[];
  psicologico: Psicologico | null;
  supervision: Supervision[];
  desempeno: Desempeno;
  historial: HistorialEvento[];
}
