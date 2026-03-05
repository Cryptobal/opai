// src/lib/portal/demo-data.ts
// Hardcoded demo data constants for prospect portal mode.
// These constants are identical for all prospects — no DB storage needed.

export const DEMO_KPI = [
  { label: "CUMPLIMIENTO", value: "97.3%", sub: "+2.1% vs mes anterior", color: "#2dd4bf" },
  { label: "RONDAS HOY", value: "24/28", sub: "85.7% completado", color: "#60a5fa" },
  { label: "TRUST SCORE", value: "8.6", sub: "+0.3 este mes", color: "#a78bfa" },
  { label: "ALERTAS", value: "2", sub: "0 criticas", color: "#f97316" },
] as const;

export const DEMO_CHART_DATA = [
  92, 95, 88, 97, 94, 96, 93, 98, 91, 95,
  97, 94, 96, 99, 93, 95, 97, 92, 96, 98,
  94, 97, 95, 93, 96, 98, 97, 95, 94, 97,
];

export const DEMO_GUARDIAS_RANKING = [
  { nombre: "Roberto Munoz", score: 9.4, rondas: "98%", puntualidad: "100%", meses: 14, avatar: "RM" },
  { nombre: "Carolina Soto", score: 9.1, rondas: "96%", puntualidad: "98%", meses: 8, avatar: "CS" },
  { nombre: "Miguel Vera", score: 8.8, rondas: "94%", puntualidad: "97%", meses: 22, avatar: "MV" },
  { nombre: "Patricia Lagos", score: 8.5, rondas: "92%", puntualidad: "95%", meses: 6, avatar: "PL" },
] as const;

export const DEMO_BITACORA = [
  { fecha: "Hoy, 07:15", tipo: "Normal" as const, texto: "Cambio de turno sin novedades. Perimetro asegurado. Guardia saliente: R. Munoz." },
  { fecha: "Hoy, 03:22", tipo: "Alerta" as const, texto: "Sensor de movimiento activado en sector B3. Verificado por guardia: causa animal callejero. Sin riesgo." },
  { fecha: "Ayer, 22:40", tipo: "Normal" as const, texto: "Ronda nocturna #1 completada. 8 checkpoints verificados. Sin hallazgos." },
  { fecha: "Ayer, 18:05", tipo: "Info" as const, texto: "Visita de supervisor semanal. Evaluacion positiva. Informe adjunto." },
] as const;

export const DEMO_MODULOS = [
  { icon: "MessageSquare", name: "Chat", desc: "Comunicacion directa" },
  { icon: "Ticket", name: "Tickets", desc: "Solicitudes y soporte" },
  { icon: "FileText", name: "Documentos", desc: "Contratos y archivos" },
  { icon: "BarChart3", name: "Reportes", desc: "Informes mensuales" },
  { icon: "Bell", name: "Alertas", desc: "Notificaciones real-time" },
  { icon: "GitCompare", name: "Comparativa", desc: "Benchmarks del servicio" },
] as const;

export const DEMO_CHAT_CHANNELS = [
  { icon: "Shield", name: "Supervision Operaciones", desc: "Equipo de supervisores asignados", locked: true },
  { icon: "Users", name: "RRHH & Dotacion", desc: "Consultas sobre guardias y dotacion", locked: true },
  { icon: "DollarSign", name: "Finanzas & Facturacion", desc: "Estado de cuenta y facturas", locked: true },
  { icon: "Building2", name: "Administracion", desc: "Contratos y documentacion legal", locked: true },
] as const;

export const DEMO_GUARDIAS_INSTALACION = [
  { name: "Roberto Munoz", turno: "Turno dia", status: "En servicio", online: true },
  { name: "Carolina Soto", turno: "Turno noche", status: "Proximo turno 22:00", online: false },
] as const;

export const DEMO_PERSONAL = [
  {
    nombre: "Roberto Munoz",
    avatar: "RM",
    turno: "Turno dia (08:00 - 20:00)",
    status: "En servicio",
    online: true,
    documentos: [
      { tipo: "Certificado OS-10", status: "validated", destacado: true },
      { tipo: "Cert. antecedentes", status: "validated", destacado: true },
      { tipo: "Cedula de identidad", status: "validated", destacado: false },
      { tipo: "Curriculum", status: "validated", destacado: false },
      { tipo: "Contrato", status: "validated", destacado: false },
    ],
  },
  {
    nombre: "Carolina Soto",
    avatar: "CS",
    turno: "Turno noche (20:00 - 08:00)",
    status: "Proximo turno",
    online: false,
    documentos: [
      { tipo: "Certificado OS-10", status: "validated", destacado: true },
      { tipo: "Cert. antecedentes", status: "validated", destacado: true },
      { tipo: "Cedula de identidad", status: "validated", destacado: false },
      { tipo: "Cert. Fonasa / Isapre", status: "validated", destacado: false },
    ],
  },
  {
    nombre: "Miguel Vera",
    avatar: "MV",
    turno: "Turno dia (08:00 - 20:00)",
    status: "Dia libre",
    online: false,
    documentos: [
      { tipo: "Certificado OS-10", status: "validated", destacado: true },
      { tipo: "Cert. antecedentes", status: "pending", destacado: true },
      { tipo: "Cedula de identidad", status: "validated", destacado: false },
    ],
  },
] as const;

export const DEMO_RONDAS = [
  { hora: "06:00", guardia: "Roberto Munoz", checkpoints: 8, completados: 8, status: "completada" },
  { hora: "04:00", guardia: "Carolina Soto", checkpoints: 8, completados: 8, status: "completada" },
  { hora: "02:00", guardia: "Carolina Soto", checkpoints: 8, completados: 7, status: "completada" },
  { hora: "00:00", guardia: "Carolina Soto", checkpoints: 8, completados: 8, status: "completada" },
  { hora: "22:00", guardia: "Roberto Munoz", checkpoints: 8, completados: 8, status: "completada" },
] as const;

export const DEMO_POSTA = [
  { hora: "08:00", entrante: "Roberto Munoz", saliente: "Carolina Soto", novedades: "Sin novedades. Perimetro asegurado.", status: "completada" },
  { hora: "20:00", entrante: "Carolina Soto", saliente: "Roberto Munoz", novedades: "Puerta sector B requiere mantencion. Reportado a administracion.", status: "completada" },
] as const;

export const DEMO_INSTALACIONES = [
  {
    name: "Edificio Corporativo Central",
    address: "Av. Providencia 1234, Providencia",
    guardCount: 4,
    status: "active",
    checkpoints: 8,
    lastRonda: "Hace 45 min",
  },
] as const;

export const DEMO_SUMMARY = {
  compliance: 97.3,
  completedRounds: 24,
  totalRounds: 28,
  trustScore: 8.6,
  alerts: 2,
  criticalAlerts: 0,
} as const;

export const DEMO_ACTIVITY = [
  { type: "ronda", description: "Ronda completada - 8/8 checkpoints", time: "Hace 45 min", guard: "Roberto Munoz" },
  { type: "alerta", description: "Sensor sector B3 - verificado sin riesgo", time: "Hace 3 horas", guard: "Carolina Soto" },
  { type: "posta", description: "Cambio de turno completado sin novedades", time: "Hace 5 horas", guard: "Roberto Munoz" },
  { type: "ronda", description: "Ronda nocturna #1 - 8/8 checkpoints", time: "Hace 8 horas", guard: "Carolina Soto" },
] as const;
