export const EMPTY_SELECTION_MESSAGE = "No hay trabajadores que coincidan con la selección";

export const EMPTY_INCIDENTES_MESSAGE = "No hay incidentes técnicos registrados";

export const NO_SUNDAY_HOLIDAY_MESSAGE =
  "La jornada de este trabajador no incluye domingos o festivos";

export const NO_SHIFT_CHANGES_MESSAGE =
  "Sin cambios o modificaciones en el periodo consultado";

/** Siglas Art. 28 g */
export const DT_SIGLAS = [
  { code: "A.I.", meaning: "Ausencia injustificada" },
  { code: "A.J.", meaning: "Ausencia justificada" },
  { code: "AT", meaning: "Atraso" },
  { code: "C.T.", meaning: "Cambio de turno" },
  { code: "D.E.J.", meaning: "Distribución excepcional de Jornada" },
  { code: "H.E.", meaning: "Horas extraordinarias" },
  { code: "J.O.", meaning: "Jornada ordinaria" },
  { code: "L.M.", meaning: "Licencia médica" },
  { code: "P.G.R", meaning: "Permiso con goce de remuneraciones" },
  { code: "PREN.", meaning: "Prenatal" },
  { code: "P.S.G.R.", meaning: "Permiso sin goce de remuneraciones" },
  { code: "POSTN", meaning: "Postnatal" },
  { code: "S.A", meaning: "Salida anticipada" },
  { code: "VAC", meaning: "Vacaciones" },
] as const;

export const DT_SIGLAS_GLOSSARY = DT_SIGLAS.map((s) => `${s.code}: ${s.meaning}`).join(" · ");

export const JORNADA_OPTIONS = [
  { id: "fija", label: "Fija" },
  { id: "turnos", label: "Por turnos" },
  { id: "ciclos", label: "Distribuida en ciclos" },
  { id: "bisemanal", label: "Bisemanal" },
  { id: "excepcional", label: "Excepcional" },
  { id: "parcial", label: "Parcial" },
] as const;

export type DtReportTipo =
  | "asistencia"
  | "jornada-diaria"
  | "domingos-festivos"
  | "modificaciones-turnos"
  | "reporte-diario"
  | "incidentes";

export const DT_REPORT_MENU: { tipo: DtReportTipo | "clientes" | "verificar-hash"; label: string }[] = [
  { tipo: "asistencia", label: "Reporte de asistencia" },
  { tipo: "jornada-diaria", label: "Reporte de jornada diaria" },
  { tipo: "domingos-festivos", label: "Reporte de días domingo y/o días festivos" },
  { tipo: "modificaciones-turnos", label: "Reporte de modificaciones y/o alteraciones de turnos" },
  { tipo: "reporte-diario", label: "Reporte diario" },
  { tipo: "incidentes", label: "Reporte de incidentes técnicos" },
  { tipo: "clientes", label: "Clientes del prestador (Art. 26)" },
  { tipo: "verificar-hash", label: "Verificar marcación por hash" },
];
