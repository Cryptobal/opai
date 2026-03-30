export interface AlertaCobertura {
  id: string;
  tenantId: string;
  creadaPorId: string;
  installationId: string;
  puestoId: string | null;
  radioKm: number;
  genero: string | null;
  modalidad: string;
  requiereOS10: boolean;
  soloDealer: boolean;
  soloConMovilizacion: boolean;
  fechaInicio: string;
  fechaFin: string;
  montoOfrecido: number;
  funciones: string;
  urgencia: string | null;
  notasInternas: string | null;
  estado: AlertaEstado;
  oleadaActual: number;
  oleadasConfig: OleadaConfig[];
  proximaOleadaAt: string | null;
  expiraAt: string;
  aceptadaAt: string | null;
  aceptadaPorGuardiaId: string | null;
  esInternoAceptacion: boolean | null;
  canceladaAt: string | null;
  canceladaPorId: string | null;
  cancelMotivo: string | null;
  confirmadaAt: string | null;
  confirmadaPorId: string | null;
  asignacionPauta: boolean | null;
  reAlertaCount: number;
  reAlertaMotivo: string | null;
  createdAt: string;
  updatedAt: string;
  installation: {
    id: string;
    name: string;
    address?: string | null;
    commune?: string | null;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  creadaPor: {
    id: string;
    name: string;
    email?: string;
  };
  aceptadaPorGuardia?: {
    id: string;
    persona: {
      firstName: string;
      lastName: string;
      rut: string;
      phone?: string | null;
    };
  } | null;
  _count?: {
    aceptaciones: number;
    notificaciones: number;
  };
}

export type AlertaEstado =
  | "ACTIVA"
  | "ACEPTADA"
  | "CONFIRMADA"
  | "ASIGNADA_PAUTA"
  | "CANCELADA"
  | "EXPIRADA"
  | "NO_CUBIERTA"
  | "PENDIENTE_CONFIRMACION";

export interface OleadaConfig {
  numero: number;
  tipo: string;
  radioMinKm: number;
  radioMaxKm: number;
  esperaMin: number;
  guardiaCount: number;
  guardiaIds: string[];
}

export interface OleadaPreview {
  numero: number;
  tipo: string;
  guardiaCount: number;
  guardias: Array<{
    id: string;
    nombre: string;
    distanciaKm: number;
  }>;
  radioKm: string;
  esperaMin: number;
}

export interface PreviewOleadasResponse {
  success: boolean;
  oleadas: OleadaPreview[];
  totalGuardias: number;
  tiempoEstimadoMin: number;
  cobertura: {
    conCoordenadas: number;
    sinCoordenadas: number;
  };
}

export interface IndiceGeograficoItem {
  installationId: string;
  name: string;
  commune: string | null;
  city: string | null;
  totalGuardias: number;
  sinCoordenadas: number;
  distanciaPromedioKm: number;
  distanciaMaxKm: number;
  anillos: {
    cercanos_0_5km: number;
    medianos_5_15km: number;
    lejanos_15_30km: number;
    muyLejanos_30plus: number;
  };
  scoreOptimizacion: number;
  alertas: string | null;
}

export interface AlertaCoberturaConfig {
  oleada0EsperaMin: number;
  oleada1RadioKm: number;
  oleada1EsperaMin: number;
  oleada2RadioKm: number;
  oleada2EsperaMin: number;
  oleada3RadioKm: number;
  oleada3EsperaMin: number;
  oleadaExternaEsperaMin: number;
  alertaTtlHoras: number;
  confirmacionDelayMin: number;
  canalInternoDefault: string[];
  canalExternoDefault: string[];
  montoDefaultClp: number;
  habilitado: boolean;
  autoAsignarPauta: boolean;
  incluirTurnoSaliente: boolean;
  notificarChatInterno: boolean;
}

export interface AlertaGuardiaPortal {
  id: string;
  instalacion: {
    id: string;
    name: string;
    address: string | null;
    commune: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
  };
  fechaInicio: string;
  fechaFin: string;
  montoOfrecido: number;
  funciones: string;
  urgencia: string | null;
  estado: string;
  tiempoRestanteSeg: number;
  aceptada: boolean;
  createdAt: string;
}

// Detail view includes oleadas log and aceptaciones
export interface AlertaDetalle extends AlertaCobertura {
  puesto?: {
    id: string;
    name: string;
    shiftStart: string | null;
    shiftEnd: string | null;
  } | null;
  aceptaciones: Array<{
    id: string;
    guardiaId: string;
    oleadaNumero: number;
    intentoAt: string;
    resultado: string;
    guardia: {
      id: string;
      persona: {
        firstName: string;
        lastName: string;
        rut: string;
      };
    };
  }>;
  oleadasLog: Array<{
    id: string;
    oleadaNumero: number;
    tipo: string;
    radioMinKm: number;
    radioMaxKm: number;
    guardiasNotificados: number;
    activadaAt: string;
  }>;
}

export const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVA: { label: "Activa", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  ACEPTADA: { label: "Aceptada", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  PENDIENTE_CONFIRMACION: { label: "Pendiente Confirmación", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  CONFIRMADA: { label: "Confirmada", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  ASIGNADA_PAUTA: { label: "Asignada Pauta", className: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
  CANCELADA: { label: "Cancelada", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  EXPIRADA: { label: "Expirada", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  NO_CUBIERTA: { label: "No Cubierta", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
};

export const URGENCIA_BADGE: Record<string, { label: string; className: string }> = {
  URGENTE: { label: "Urgente", className: "bg-red-500/20 text-red-400 border-red-500/30 animate-pulse" },
  HOY: { label: "Hoy", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  PROGRAMADA: { label: "Programada", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

export function formatClp(amount: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}
