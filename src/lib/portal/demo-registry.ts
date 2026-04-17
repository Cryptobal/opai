import type { ClienteSession } from "@/lib/portal-cliente-types";

export type DemoKey =
  | "dashboard_summary"
  | "dashboard_compliance"
  | "dashboard_guards"
  | "dashboard_activity"
  | "rondas_list"
  | "ronda_detail"
  | "posta_list"
  | "marcaciones_list"
  | "equipamiento_detail"
  | "access_control_live"
  | "access_control_history"
  | "personal_list"
  | "desempeno_detail"
  | "tickets_list"
  | "alertas_notificaciones"
  | "alertas_config"
  | "encuestas_list"
  | "reportes_list"
  | "comparativa_data"
  | "documentos_list"
  | "protocolos_list"
  | "cotizaciones_list"
  | "instalaciones_list"
  | "instalacion_detail";

type DemoGen<T> = (session: ClienteSession) => T;

const registry: Partial<Record<DemoKey, DemoGen<unknown>>> = {
  dashboard_summary: () => ({
    compliance: 97.3,
    complianceTrend: 2.1,
    completedRounds: 24,
    totalRounds: 28,
    trustScore: 8.6,
    trustTrend: 0.3,
    alerts: 2,
    alertsTrend: 0,
  }),
  dashboard_compliance: () => {
    const pts = [92, 95, 88, 97, 94, 96, 93, 98, 91, 95, 97, 94, 96, 99, 93, 95, 97, 92, 96, 98, 94, 97, 95, 93, 96, 98, 97, 95, 94, 97];
    return pts.map((v, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (pts.length - 1 - i));
      return { date: d.toISOString().slice(0, 10), compliance: v, total: 28, completed: Math.round(v * 28 / 100) };
    });
  },
  dashboard_guards: () => [
    { name: "Roberto Muñoz", rounds: 27, trustAvg: 94 },
    { name: "Carolina Soto", rounds: 25, trustAvg: 91 },
    { name: "Miguel Vera", rounds: 22, trustAvg: 88 },
  ],
  dashboard_activity: () => [
    { id: "1", type: "ronda", icon: "green", timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(), text: "Ronda completada — 8/8 checkpoints", detail: "Roberto Muñoz" },
    { id: "2", type: "alerta", icon: "amber", timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), text: "Sensor sector B3 — verificado sin riesgo", detail: "Carolina Soto" },
    { id: "3", type: "posta", icon: "blue", timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), text: "Cambio de turno sin novedades", detail: "Roberto Muñoz" },
  ],
  rondas_list: () => [
    { id: "demo-r-1", installationId: "demo", status: "completada", scheduledAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), startedAt: null, completedAt: new Date(Date.now() - 1.8 * 3600 * 1000).toISOString(), checkpointsTotal: 8, checkpointsCompletados: 8, porcentajeCompletado: 100, trustScore: 9.2, durationMinutes: 28, notes: null, guardia: { persona: { firstName: "Roberto", lastName: "Muñoz" } } },
    { id: "demo-r-2", installationId: "demo", status: "completada", scheduledAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), startedAt: null, completedAt: null, checkpointsTotal: 8, checkpointsCompletados: 7, porcentajeCompletado: 87, trustScore: 8.1, durationMinutes: 25, notes: null, guardia: { persona: { firstName: "Carolina", lastName: "Soto" } } },
  ],
  ronda_detail: () => ({
    id: "demo-r-1",
    installationId: "demo",
    status: "completada",
    scheduledAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    startedAt: null,
    completedAt: new Date(Date.now() - 1.8 * 3600 * 1000).toISOString(),
    checkpointsTotal: 8,
    checkpointsCompletados: 8,
    porcentajeCompletado: 100,
    trustScore: 9.2,
    durationMinutes: 28,
    notes: "Ronda nocturna sin novedades",
    guardia: { persona: { firstName: "Roberto", lastName: "Muñoz" } },
    marcaciones: [
      { id: "demo-m-1", checkpointId: "cp-1", timestamp: new Date(Date.now() - 1.95 * 3600 * 1000).toISOString(), lat: -33.4372, lng: -70.6506, geoValidada: true, fotoEvidenciaUrl: null, note: "Portería verificada", status: "ok" },
      { id: "demo-m-2", checkpointId: "cp-2", timestamp: new Date(Date.now() - 1.92 * 3600 * 1000).toISOString(), lat: -33.4373, lng: -70.6507, geoValidada: true, fotoEvidenciaUrl: null, note: "Sector B inspeccionado", status: "ok" },
    ],
    incidentes: [],
  }),
  posta_list: () => [
    { id: "demo-p-1", statusInstalacion: "normal", guardiasPresentes: 2, guardiasRequeridos: 2, notes: "Sin novedades. Perímetro asegurado.", controlNocturno: { date: new Date().toISOString(), centralOperatorName: "Central OPAI", generalNotes: null } },
    { id: "demo-p-2", statusInstalacion: "novedad", guardiasPresentes: 2, guardiasRequeridos: 2, notes: "Puerta sector B requiere mantención.", controlNocturno: { date: new Date(Date.now() - 86400000).toISOString(), centralOperatorName: "Central OPAI", generalNotes: null } },
  ],
  marcaciones_list: () => ({
    installationName: "Edificio Corporativo Central",
    marcaciones: [
      { id: "demo-mc-1", tipo: "entrada", timestamp: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), guardiaName: "Roberto Muñoz", geoValidada: true, geoDistanciaM: 12, gpsStatus: "dentro_rango", lat: -33.4372, lng: -70.6506, metodoId: "face_id", fotoEvidenciaUrl: null },
      { id: "demo-mc-2", tipo: "salida", timestamp: new Date(Date.now() - 9 * 3600 * 1000).toISOString(), guardiaName: "Carolina Soto", geoValidada: true, geoDistanciaM: 8, gpsStatus: "dentro_rango", lat: -33.4372, lng: -70.6506, metodoId: "face_id", fotoEvidenciaUrl: null },
    ],
  }),
  equipamiento_detail: () => ({
    installationName: "Edificio Corporativo Central",
    deliveries: [
      { id: "demo-e-1", date: new Date(Date.now() - 30 * 86400000).toISOString(), guardiaName: "Roberto Muñoz", items: [{ product: "Uniforme invierno", size: "L", quantity: 1 }, { product: "Calzado táctico", size: "42", quantity: 1 }] },
    ],
    assets: [
      { id: "demo-a-1", product: "Handy Motorola", assignedAt: new Date(Date.now() - 60 * 86400000).toISOString() },
    ],
  }),
  access_control_live: () => [
    { time: "08:12", name: "Juan Pérez", type: "Ingreso", method: "Cédula", status: "Autorizado" },
    { time: "08:45", name: "Proveedor TI", type: "Ingreso", method: "Pre-registro", status: "Autorizado" },
    { time: "09:30", name: "María González", type: "Salida", method: "Cédula", status: "Autorizado" },
  ],
  access_control_history: () => [],
  personal_list: () => [
    { nombre: "Roberto Muñoz", avatar: "RM", turno: "Turno día (08:00 - 20:00)", status: "En servicio", online: true, documentos: [{ tipo: "Certificado OS-10", status: "validated", destacado: true }, { tipo: "Cert. antecedentes", status: "validated", destacado: true }, { tipo: "Contrato", status: "validated", destacado: false }] },
    { nombre: "Carolina Soto", avatar: "CS", turno: "Turno noche (20:00 - 08:00)", status: "Próximo turno", online: false, documentos: [{ tipo: "Certificado OS-10", status: "validated", destacado: true }, { tipo: "Cert. antecedentes", status: "validated", destacado: true }] },
  ],
  desempeno_detail: () => ({
    trustScore: 8.6,
    promedioIndustria: null,
    kpis: {
      guardiasActivos: 3,
      asistenciaMes: 95,
      rondasCompletadas: 94,
      diasSinIncidentes: 18,
    },
    guardias: [
      { guardiaId: "demo-g-1", nombre: "Roberto Muñoz", nivel: "Avanzado", trustScore: 9.2, asistencia: 98, tendencia: "up" as const },
      { guardiaId: "demo-g-2", nombre: "Carolina Soto", nivel: "Intermedio", trustScore: 8.8, asistencia: 95, tendencia: "up" as const },
    ],
  }),
  tickets_list: () => [],
  alertas_notificaciones: () => [
    { type: "ronda_completada", title: "Ronda nocturna completada", description: "100% checkpoints verificados", time: "Hace 2h", isRead: false },
    { type: "ticket_respondido", title: "Ticket #1234 respondido", description: "Tu consulta fue respondida", time: "Hace 5h", isRead: false },
  ],
  alertas_config: () => [
    { id: null, alertType: "guard_absent", channels: { push: true, email: true }, isActive: true },
    { id: null, alertType: "ronda_incomplete", channels: { push: true, email: false }, isActive: true },
  ],
  encuestas_list: () => [
    { id: "demo-enc-1", installationId: "demo", contactName: "Evaluación mensual", serviceQuality: 4.5, scheduleCompliance: 5, personalPresentation: 4, professionalism: 4.5, supervisionPresence: 4, incidentResponse: 5, npsScore: 9, additionalComments: "Excelente servicio.", averageScore: 4.5, createdAt: new Date(Date.now() - 15 * 86400000).toISOString() },
  ],
  reportes_list: () => [],
  comparativa_data: () => [],
  documentos_list: () => ({ folders: [], files: [] }),
  protocolos_list: () => [
    {
      id: "demo-proto-1",
      title: "Protocolo General de Seguridad",
      version: "v2.1",
      updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      status: "active",
      lastAcceptance: null,
      requiresSignature: true,
      sections: [
        { title: "Control de Acceso", items: ["Verificación de identidad obligatoria", "Registro fotográfico digital", "Notificación al responsable"] },
        { title: "Rondas de Seguridad", items: ["Rondas cada 2 horas en horario nocturno", "Verificación de perímetro", "Reporte de anomalías"] },
      ],
    },
  ],
  cotizaciones_list: () => [],
  instalaciones_list: () => [
    { id: "demo-inst-1", name: "Edificio Corporativo Central", address: "Av. Providencia 1234, Providencia", commune: "Providencia", guardCount: 4, checkpoints: 8, status: "active" },
  ],
  instalacion_detail: () => ({
    installation: { id: "demo-inst-1", name: "Edificio Corporativo Central", address: "Av. Providencia 1234, Providencia", commune: "Providencia", lat: -33.4372, lng: -70.6506 },
    guardiasAsignados: [
      { id: "demo-g-1", nombre: "Roberto Muñoz", turno: "Turno día" },
      { id: "demo-g-2", nombre: "Carolina Soto", turno: "Turno noche" },
    ],
    rondasHoy: { total: 8, completadas: 7 },
    complianceMes: 96,
    ticketsAbiertos: 1,
    lastActivity: { at: new Date(Date.now() - 45 * 60 * 1000).toISOString(), status: "completada", guardName: "Roberto Muñoz" },
  }),
};

export function getDemoData<T>(key: DemoKey, session: ClienteSession): T {
  const gen = registry[key];
  if (!gen) throw new Error(`Demo data not registered for key: ${key}`);
  return gen(session) as T;
}

export function hasDemoData(key: DemoKey): boolean {
  return registry[key] !== undefined;
}
