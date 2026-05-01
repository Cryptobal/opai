export interface AlertaCobertura {
  id: string;
  tenantId: string;
  creadaPorId: string;
  installationId: string | null;
  puestoId: string | null;
  libreAddress: string | null;
  libreLat: number | null;
  libreLng: number | null;
  libreComuna: string | null;
  libreCiudad: string | null;
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
  asignacionPauta: "AUTOMATICA" | "MANUAL" | null;
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
  } | null;
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
  guardias?: Array<{
    id: string;
    nombre: string;
    distanciaKm: number | null;
  }>;
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

export interface NotificacionRegistro {
  id: string;
  guardiaId: string;
  oleadaNumero: number;
  canal: string;
  enviadaAt: string;
  entregada: boolean;
  leida: boolean;
  leidaAt: string | null;
  errorDetalle: string | null;
  guardia?: {
    lifecycleStatus?: string;
    availableExtraShifts?: boolean;
    persona: {
      firstName: string;
      lastName: string;
      phone: string | null;
      phoneMobile?: string | null;
    };
  };
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
  notificaciones?: NotificacionRegistro[];
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
  ACTIVA: { label: "Activa", className: "bg-status-info-soft text-status-info-fg border-status-info-border" },
  ACEPTADA: { label: "Aceptada", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  PENDIENTE_CONFIRMACION: { label: "Pendiente Confirmación", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  CONFIRMADA: { label: "Confirmada", className: "bg-green-500/20 text-status-ok-fg border-status-ok-border" },
  ASIGNADA_PAUTA: { label: "Asignada Pauta", className: "bg-teal-500/20 text-status-info-fg border-status-info-border" },
  CANCELADA: { label: "Cancelada", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  EXPIRADA: { label: "Expirada", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  NO_CUBIERTA: { label: "No Cubierta", className: "bg-orange-500/20 text-status-warn-fg border-status-warn-border" },
};

export const URGENCIA_BADGE: Record<string, { label: string; className: string }> = {
  URGENTE: { label: "Urgente", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border animate-pulse" },
  HOY: { label: "Hoy", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  PROGRAMADA: { label: "Programada", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

export function formatClp(amount: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}
