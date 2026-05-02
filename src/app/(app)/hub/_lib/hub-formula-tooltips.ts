/**
 * Tooltips con la fórmula de cálculo de cada widget del hub.
 * Centralizados para mantener consistencia y permitir actualización rápida.
 */

export const FORMULA_TOOLTIPS = {
  rondasHeatmap: `Conteo de rondas completadas por instalación en los últimos 30 días móviles.
Solo se cuentan ejecuciones con status = "completada".
Las celdas vacías indican días sin rondas completadas — pueden ser días sin programación o rondas perdidas.`,

  ticketsMatrix: `Tickets activos por instalación, desglosados por prioridad.
Estados activos: open, in_progress, waiting, pending_approval.
"SLA vencido" = tickets con slaBreached = true.
Los tickets sin instalación asignada se agrupan en "Sin instalación".`,

  conocimientoMatrix: `Notas de pruebas de conocimiento de los guardias activos en cada instalación.
"Activo" = guardia con currentInstallationId asignado a esa instalación al día de hoy.
Para cada guardia se toma la última nota (último ExamAssignment con status = "completed").
Las instalaciones sin guardias activos o sin pruebas no aparecen.`,

  visitasHeatmap: `Visitas de supervisión por instalación × día del mes.
Cuenta cada visita registrada (OpsVisitaSupervision.checkInAt) en el mes seleccionado.`,

  installationHealth: `Score de salud operacional por instalación (0-100).
Combina: días desde última visita, hallazgos abiertos, hallazgos vencidos, cumplimiento de dotación, cumplimiento de checklist, libro al día.
El cálculo se actualiza periódicamente vía OpsInstallationHealthScore.`,

  contratosCliente: `Contratos derivados del Quote (CpqQuote) vinculado al deal ganado:
- Inicio: contractStartDate del quote.
- Fin estimado: contractStartDate + contractDuration meses.
"Sin contrato" = cuenta activa sin quote ganado con fechas válidas.
"Por vencer" = vence en próximos 90 días.
"Vencido" = pasó la fecha de fin sin renovación registrada.`,

  postulantesSemana: `Nuevas postulaciones (AtsApplication) creadas en últimos 7 días móviles.
"Conversión" = % que pasó de POSTULADO a una etapa posterior dentro de la semana.`,

  cumpleanosSemana: `Guardias activos (currentInstallationId no nulo) cuyo cumpleaños cae en los próximos 7 días.`,
} as const;
