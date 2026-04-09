import { z } from "zod";

export const crearAlertaSchema = z
  .object({
    // Modo instalación
    installationId: z.string().uuid().optional(),
    puestoId: z.string().uuid().optional(),

    // Modo libre (dirección manual)
    libreAddress: z.string().min(3).max(300).optional(),
    libreLat: z.number().min(-90).max(90).optional(),
    libreLng: z.number().min(-180).max(180).optional(),
    libreComuna: z.string().max(120).optional(),
    libreCiudad: z.string().max(120).optional(),

    modalidad: z.enum(["GGSS", "CCTV", "TACTICO", "MIXTO"]),
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
    /** A quién notificar. Default: ambos (internos contratados + externos con turnos extra). */
    audiencia: z.enum(["internos", "externos", "ambos"]).optional(),
    /** Override opcional de la config de oleadas del tenant para esta alerta. */
    oleadasOverride: z
      .object({
        oleada1RadioKm: z.number().min(1).max(500).optional(),
        oleada1EsperaMin: z.number().int().min(1).max(120).optional(),
        oleada2RadioKm: z.number().min(1).max(500).optional(),
        oleada2EsperaMin: z.number().int().min(1).max(120).optional(),
        oleada3RadioKm: z.number().min(1).max(500).optional(),
        oleada3EsperaMin: z.number().int().min(1).max(120).optional(),
        oleadaExternaEsperaMin: z.number().int().min(1).max(240).optional(),
      })
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      const hasInstallation = !!data.installationId;
      const hasLibre =
        !!data.libreAddress && data.libreLat != null && data.libreLng != null;
      return hasInstallation || hasLibre;
    },
    {
      message:
        "Debes seleccionar una instalación o ingresar una dirección libre con coordenadas",
      path: ["installationId"],
    },
  )
  .refine(
    (data) => {
      // En modo libre el monto debe ser > 0 (no hay instalación/puesto de donde heredar)
      if (!data.installationId && data.montoOfrecido <= 0) return false;
      return true;
    },
    {
      message: "En modo libre el monto ofrecido debe ser mayor a 0",
      path: ["montoOfrecido"],
    },
  );

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
