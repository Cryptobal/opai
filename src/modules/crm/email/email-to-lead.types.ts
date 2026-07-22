export type LeadContacto = {
  nombre: string | null;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
};

/** Puesto / turno estructurado extraído del correo (editable antes de crear). */
export type LeadExtractionPuesto = {
  /** Nombre del servicio o grupo (ej. "Turno día", "Control de acceso"). */
  nombre: string | null;
  /** Rol / cargo en texto libre (ej. "Guardia", "Supervisor"). */
  rol: string | null;
  descripcion: string | null;
  /** Días en minúsculas sin acento: lunes…domingo. */
  dias: string[];
  horaInicio: string | null; // HH:mm
  horaFin: string | null;
  numGuards: number | null;
  numPuestos: number | null;
  sueldoBruto: number | null;
};

/** Propuesta de lead extraída por IA de un correo (NO crea nada por sí sola). */
export type LeadExtraction = {
  empresa: string | null;
  rut: string | null;
  contacto: LeadContacto;
  requerimiento: string | null;
  dotacionEstimada: number | null;
  /** @deprecated usar instalacionComuna; se mantiene por compat. */
  instalacionComuna: string | null;
  instalacionNombre: string | null;
  direccion: string | null;
  ciudad: string | null;
  /** URL de Google Maps (corta o larga) detectada en el hilo. */
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  nombreCotizacion: string | null;
  /** true = continuo / indefinido; false = plazo fijo. */
  isOngoingService: boolean;
  /** Meses de contrato si !isOngoingService. */
  mesesContrato: number | null;
  puestos: LeadExtractionPuesto[];
  fechaLimite: string | null; // YYYY-MM-DD
  esLicitacion: boolean;
  /** Confianza 0-1 por campo (empresa, contacto, requerimiento, …). */
  confianza: Record<string, number>;
};

/** Archivo del correo ya subido a R2 staging (chat-staged), listo para adjuntar. */
export type StagedFile = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type LeadExtractionResult = {
  proposal: LeadExtraction;
  stagedFiles: StagedFile[];
  /** Notas de fuentes analizadas ("PDF bases.pdf", "imagen plano.png (visión)"). */
  sources: string[];
};

export type CreateLeadMode = "lead" | "lead_y_negocio";

export const WEEKDAYS_FULL = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export function emptyLeadExtraction(): LeadExtraction {
  return {
    empresa: null,
    rut: null,
    contacto: { nombre: null, cargo: null, email: null, telefono: null },
    requerimiento: null,
    dotacionEstimada: null,
    instalacionComuna: null,
    instalacionNombre: null,
    direccion: null,
    ciudad: null,
    mapsUrl: null,
    lat: null,
    lng: null,
    nombreCotizacion: null,
    isOngoingService: true,
    mesesContrato: null,
    puestos: [],
    fechaLimite: null,
    esLicitacion: false,
    confianza: {},
  };
}
