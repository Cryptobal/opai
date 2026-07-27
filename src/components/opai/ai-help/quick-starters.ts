import type { ChatPageContextValue } from "../ChatPageContextProvider";

/**
 * Starters dinámicos: se adaptan a la entidad que el usuario está viendo
 * (pageContext) o, en su defecto, al módulo actual (pathname).
 * Fallback: starters genéricos.
 */
export function getQuickStarters(
  pageContext: ChatPageContextValue | null,
  pathname: string | null,
): string[] {
  // 1) Contexto de página: prioridad máxima
  if (pageContext) {
    switch (pageContext.entityType) {
      case "crm_account":
        return [
          "Resúmeme este cliente",
          "¿Qué cotizaciones tiene?",
          "Lista sus contratos y documentos",
          "¿Cuál fue la última actividad?",
        ];
      case "crm_deal":
        return [
          "Resúmeme este deal",
          "¿En qué etapa está y cuál es el próximo paso?",
          "¿Qué cotizaciones tiene asociadas?",
          "¿Cuánto falta para el cierre esperado?",
        ];
      case "crm_installation":
        return [
          "Resúmeme esta instalación",
          "¿Quién es el supervisor asignado?",
          "¿Cuántos puestos y guardias tiene?",
          "¿Hay alertas recientes?",
        ];
      case "cpq_quote":
        return [
          "Resúmeme esta cotización",
          "¿Qué incluye el servicio?",
          "¿Cuándo vence y cuál es el monto mensual?",
          "Genera un resumen para enviar al cliente",
        ];
      case "ops_guardia":
        return [
          "Resúmeme este guardia",
          "¿Qué documentos tiene vigentes?",
          "¿Cómo ha sido su asistencia?",
          "¿Tiene turnos extra recientes?",
        ];
      case "doc_document":
        return [
          "Resúmeme este documento en 5 puntos",
          "¿Cuáles son las obligaciones principales?",
          "¿Qué montos y fechas clave menciona?",
          "¿Está vigente y quién lo firmó?",
        ];
      case "crm_contact":
        return [
          "Resúmeme este contacto",
          "¿Qué interacciones tiene registradas?",
          "¿A qué cuenta pertenece?",
          "Abre el correo para escribirle",
        ];
      case "crm_email_thread":
        return [
          "Muéstrame qué crearías (cuenta, contacto, instalaciones, cobertura y dotación)",
          "Crea CRM completo desde este mail",
          "Resume este correo y sus adjuntos",
          "¿Qué pide el cliente en este hilo?",
        ];
      default:
        break;
    }
  }

  // 2) Pathname: módulo actual
  // IMPORTANTE: el orden importa — las rutas más específicas deben ir antes
  // que las más genéricas (ej. /crm/leads antes que /crm).
  const p = pathname ?? "";

  // ── CRM ──
  if (p.startsWith("/crm/leads")) {
    return [
      "¿Cómo creo un prospecto?",
      "Muéstrame los leads más recientes",
      "¿Cómo convierto un prospecto en cliente?",
      "Buscar prospecto por nombre",
    ];
  }
  if (p.startsWith("/crm/contacts")) {
    return [
      "¿Cómo creo un contacto nuevo?",
      "Buscar contacto por nombre o correo",
      "¿Cómo vinculo un contacto a una cuenta?",
      "Muéstrame contactos sin interacciones recientes",
    ];
  }
  if (p.startsWith("/crm/accounts")) {
    return [
      "Busca una cuenta por nombre",
      "¿Cómo creo una cuenta nueva?",
      "Lista las cuentas con deals abiertos",
      "¿Qué cuentas tienen contratos por vencer?",
    ];
  }
  if (p.startsWith("/crm/deals")) {
    return [
      "Resume el pipeline comercial",
      "¿Qué deals cierran esta semana?",
      "Lista los deals abiertos por etapa",
      "¿Cómo creo un deal nuevo?",
    ];
  }
  if (p.startsWith("/crm/cotizaciones") || p.startsWith("/cpq")) {
    return [
      "Lista las últimas cotizaciones enviadas",
      "¿Cómo clono una cotización?",
      "¿Qué cotizaciones están por vencer?",
      "Buscar cotización por código",
    ];
  }
  if (p.startsWith("/crm/installations")) {
    return [
      "Lista las instalaciones activas",
      "¿Cómo doy de alta una instalación?",
      "Instalaciones con alertas recientes",
      "Buscar instalación por nombre o dirección",
    ];
  }
  if (p.startsWith("/crm/correos")) {
    return [
      "Busca correos sobre licitaciones de seguridad",
      "Resume el correo que estoy viendo",
      "Muéstrame qué crearías desde este mail (CRM + dotación)",
      "¿Qué adjuntos tiene este hilo?",
    ];
  }
  if (p.startsWith("/crm")) {
    return [
      "Busca un cliente por nombre",
      "¿Cómo creo una cuenta nueva?",
      "Resume el pipeline comercial",
      "Lista las últimas cotizaciones",
    ];
  }

  // ── Operaciones ──
  if (p.startsWith("/ops/rondas/monitoreo")) {
    return [
      "¿Qué rondas están en curso?",
      "¿Hay checkpoints atrasados ahora?",
      "Resume el estado de monitoreo en vivo",
      "¿Cómo interpreto las alertas de ronda?",
    ];
  }
  if (p.startsWith("/ops/rondas") || p.startsWith("/rondas")) {
    return [
      "Estado de rondas de hoy",
      "¿Hay alertas de checkpoints?",
      "¿Cómo creo una plantilla de rondas?",
      "Resume la supervisión de esta semana",
    ];
  }
  if (p.startsWith("/ops/pautas") || p.startsWith("/ops/pauta")) {
    return [
      "¿Cómo creo la pauta del mes?",
      "¿Cuántos PPC tengo hoy?",
      "Explícame cómo funciona un slot",
      "Diferencia entre pauta mensual y asistencia diaria",
    ];
  }
  if (p.startsWith("/ops/supervision")) {
    return [
      "Resume las visitas de supervisión de hoy",
      "¿Qué hallazgos críticos hay abiertos?",
      "¿Cómo agendo una nueva visita?",
      "Reportes de supervisión de esta semana",
    ];
  }
  if (p.startsWith("/ops/control-nocturno")) {
    return [
      "Estado del control nocturno de hoy",
      "¿Cómo creo un turno de control nocturno?",
      "KPIs del control nocturno",
      "Incidencias detectadas esta semana",
    ];
  }
  if (p.startsWith("/ops/asistencia") || p.startsWith("/ops/marcacion")) {
    return [
      "Resume la asistencia de hoy",
      "¿Cuántas ausencias hubo?",
      "Turnos extra pendientes de aprobación",
      "¿Cómo funciona la marcación por QR?",
    ];
  }
  if (p.startsWith("/ops/ats")) {
    return [
      "¿Cuántos candidatos activos tengo en el ATS?",
      "¿Cómo creo una vacante nueva?",
      "Explícame las etapas del pipeline de selección",
      "Candidatos listos para contratar",
    ];
  }
  if (p.startsWith("/ops/tickets")) {
    return [
      "¿Cuántos tickets abiertos hay?",
      "Tickets críticos sin asignar",
      "¿Cómo escalo un ticket?",
      "Resume los tickets de esta semana",
    ];
  }
  if (p.startsWith("/ops/puestos")) {
    return [
      "Lista los puestos operativos",
      "¿Cómo configuro un puesto nuevo?",
      "¿Qué puestos tienen PPC hoy?",
      "Puestos por instalación",
    ];
  }
  if (p.startsWith("/ops/inventario")) {
    return [
      "Stock disponible por bodega",
      "¿Cómo registro una entrega?",
      "Últimas compras realizadas",
      "Activos asignados por guardia",
    ];
  }
  if (p.startsWith("/ops/alertas-cobertura")) {
    return [
      "Alertas de cobertura activas ahora",
      "¿Cómo resuelvo una alerta de cobertura?",
      "Historial de alertas de esta semana",
      "Configurar umbrales de alerta",
    ];
  }
  if (p.startsWith("/ops")) {
    return [
      "Resume el estado operativo de hoy",
      "¿Cuántos PPC tengo?",
      "¿Qué alertas de pánico hay recientes?",
      "¿Cómo configuro un puesto operativo?",
    ];
  }

  // ── Personas / RRHH ──
  if (p.startsWith("/personas/guardias")) {
    return [
      "Buscar guardia por nombre o RUT",
      "Resume las métricas de guardias",
      "¿Qué documentos vencen pronto?",
      "¿Cómo doy de alta un guardia?",
    ];
  }
  if (p.startsWith("/personas/gamificacion")) {
    return [
      "Ranking de guardias del mes",
      "¿Cómo funciona la gamificación?",
      "Guardias con mejor desempeño",
      "Configurar reglas de puntaje",
    ];
  }
  if (p.startsWith("/personas")) {
    return [
      "Resume el estado del personal",
      "Buscar guardia por nombre o RUT",
      "¿Qué documentos vencen pronto?",
      "¿Cómo doy de alta un colaborador?",
    ];
  }

  // ── Finanzas ──
  if (p.startsWith("/finanzas/rendiciones")) {
    return [
      "¿Cuántas rendiciones hay pendientes?",
      "¿Cómo apruebo una rendición?",
      "Rendiciones vencidas",
      "¿Cómo cargo una nueva rendición?",
    ];
  }
  if (p.startsWith("/finanzas/facturacion")) {
    return [
      "¿Qué DTE están por vencer?",
      "¿Cómo emito una factura electrónica?",
      "Notas de crédito pendientes",
      "Resume la facturación del mes",
    ];
  }
  if (p.startsWith("/finanzas/conciliacion")) {
    return [
      "Movimientos bancarios sin conciliar",
      "¿Cómo concilio una partida?",
      "Resume la conciliación del mes",
      "Diferencias detectadas hoy",
    ];
  }
  if (p.startsWith("/finanzas/contabilidad")) {
    return [
      "¿Cómo creo un asiento contable?",
      "Últimos asientos registrados",
      "Cuentas contables más usadas",
      "Cerrar período contable",
    ];
  }
  if (p.startsWith("/finanzas") || p.startsWith("/finance")) {
    return [
      "¿Cuántas rendiciones hay pendientes?",
      "Resume las finanzas del último mes",
      "¿Qué DTE están por vencer?",
      "¿Cómo apruebo una rendición?",
    ];
  }

  // ── Payroll ──
  if (p.startsWith("/payroll/parameters")) {
    return [
      "¿Qué parámetros tengo configurados?",
      "¿Cómo actualizo la UF / UTM?",
      "Parámetros de AFP y Salud",
      "Explícame cada parámetro de payroll",
    ];
  }
  if (p.startsWith("/payroll/simulator")) {
    return [
      "Explícame el simulador de sueldos",
      "Simula un sueldo con bonos",
      "¿Cómo calculo el costo de un guardia?",
      "Diferencia entre líquido e imponible",
    ];
  }
  if (p.startsWith("/payroll")) {
    return [
      "Explícame el simulador de sueldos",
      "¿Cuál es la UF y UTM de hoy?",
      "¿Cómo configuro parámetros de payroll?",
      "¿Cómo cierro un período de payroll?",
    ];
  }

  // ── Documentos ──
  if (p.startsWith("/opai/documentos/templates")) {
    return [
      "¿Cómo creo una plantilla nueva?",
      "Lista las plantillas disponibles",
      "¿Cómo uso variables en una plantilla?",
      "Duplicar una plantilla existente",
    ];
  }
  if (p.startsWith("/opai/documentos")) {
    return [
      "¿Cómo genero un contrato?",
      "¿Cómo funciona la firma digital?",
      "Buscar documento por nombre",
      "Lista las plantillas disponibles",
    ];
  }

  // ── Configuración ──
  if (p.startsWith("/opai/configuracion/ats")) {
    return [
      "¿Cómo configuro las etapas del ATS?",
      "Plantillas de correo para candidatos",
      "Fuentes de reclutamiento activas",
      "Requisitos por vacante",
    ];
  }
  if (p.startsWith("/opai/configuracion/crm")) {
    return [
      "¿Cómo configuro etapas del pipeline?",
      "Campos personalizados del CRM",
      "Reglas de asignación de leads",
      "Configurar fuentes de origen",
    ];
  }
  if (p.startsWith("/opai/configuracion/cpq")) {
    return [
      "¿Cómo creo un ítem de cotización?",
      "Configurar descuentos y márgenes",
      "Plantillas de cotización",
      "Reglas de aprobación",
    ];
  }
  if (p.startsWith("/opai/configuracion/asistente-ia")) {
    return [
      "¿Qué roles pueden usar el asistente?",
      "¿Cómo habilito preguntas sobre datos?",
      "Explícame las bases de conocimiento",
      "Configurar proveedor de IA",
    ];
  }
  if (p.startsWith("/opai/configuracion")) {
    return [
      "¿Cómo creo un rol nuevo?",
      "¿Qué permisos tiene mi usuario?",
      "Explícame la jerarquía de roles",
      "¿Cómo invito a un usuario?",
    ];
  }
  if (p.startsWith("/opai/usuarios")) {
    return [
      "¿Cómo invito a un usuario nuevo?",
      "Lista de usuarios activos",
      "¿Cómo desactivo un usuario?",
      "Asignar un rol a un usuario",
    ];
  }

  // ── Hub / Home ──
  if (p === "/" || p.startsWith("/hub")) {
    return [
      "¿Qué puedes hacer?",
      "Resume el estado operativo de hoy",
      "¿Cuántas rendiciones hay pendientes?",
      "Muéstrame mis pendientes del día",
    ];
  }

  // 3) Fallback genérico
  return [
    "¿Qué puedes hacer?",
    "Resume el estado de operaciones de hoy",
    "¿Cuántas rendiciones hay pendientes?",
    "¿Cómo configuro rondas?",
  ];
}
