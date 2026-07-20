export type LeadContacto = {
  nombre: string | null;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
};

/** Propuesta de lead extraída por IA de un correo (NO crea nada por sí sola). */
export type LeadExtraction = {
  empresa: string | null;
  rut: string | null;
  contacto: LeadContacto;
  requerimiento: string | null;
  dotacionEstimada: number | null;
  instalacionComuna: string | null;
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
