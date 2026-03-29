import { z } from "zod";

export const crearAlertaSchema = z.object({
  installationId: z.string().uuid(),
  puestoId: z.string().uuid().optional(),
  modalidad: z.enum(["GGSS", "CCTV", "TACTICO"]),
  fechaInicio: z.string().datetime(),
  fechaFin: z.string().datetime(),
  montoOfrecido: z.number().int().min(0),
  funciones: z.string().min(1).max(1000),
  urgencia: z.enum(["URGENTE", "HOY", "PROGRAMADA"]).optional(),
  notasInternas: z.string().max(500).optional(),
  radioKm: z.number().min(1).max(500).optional(),
  genero: z.enum(["M", "F"]).nullable().optional(),
  requiereOS10: z.boolean().optional(),
  soloDealer: z.boolean().optional(),
  soloConMovilizacion: z.boolean().optional(),
});

export const cancelarAlertaSchema = z.object({
  motivo: z.string().min(1, "El motivo de cancelación es obligatorio").max(500),
});

export const confirmarAlertaSchema = z.object({
  asignacionPauta: z.enum(["AUTOMATICA", "MANUAL"]),
});

export const reAlertarSchema = z.object({
  motivo: z.string().max(500).optional(),
});

export const actualizarConfigSchema = z.object({
  oleada0EsperaMin: z.number().int().min(1).max(60).optional(),
  oleada1RadioKm: z.number().min(1).max(500).optional(),
  oleada1EsperaMin: z.number().int().min(1).max(60).optional(),
  oleada2RadioKm: z.number().min(1).max(500).optional(),
  oleada2EsperaMin: z.number().int().min(1).max(60).optional(),
  oleada3RadioKm: z.number().min(1).max(500).optional(),
  oleada3EsperaMin: z.number().int().min(1).max(60).optional(),
  oleadaExternaEsperaMin: z.number().int().min(1).max(120).optional(),
  alertaTtlHoras: z.number().int().min(1).max(48).optional(),
  confirmacionDelayMin: z.number().int().min(10).max(240).optional(),
  canalInternoDefault: z.array(z.enum(["PUSH", "EMAIL", "WHATSAPP", "CHAT"])).optional(),
  canalExternoDefault: z.array(z.enum(["PUSH", "EMAIL", "WHATSAPP", "CHAT"])).optional(),
  montoDefaultClp: z.number().int().min(0).optional(),
  habilitado: z.boolean().optional(),
  autoAsignarPauta: z.boolean().optional(),
  incluirTurnoSaliente: z.boolean().optional(),
  notificarChatInterno: z.boolean().optional(),
});

export type CrearAlertaInput = z.infer<typeof crearAlertaSchema>;
export type CancelarAlertaInput = z.infer<typeof cancelarAlertaSchema>;
export type ConfirmarAlertaInput = z.infer<typeof confirmarAlertaSchema>;
export type ReAlertarInput = z.infer<typeof reAlertarSchema>;
export type ActualizarConfigInput = z.infer<typeof actualizarConfigSchema>;
