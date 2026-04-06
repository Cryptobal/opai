import { buildHelpChatSystemPrompt } from "@/lib/ai/help-chat-system-prompt"

type BuildHelpChatSystemPromptV2Params = {
  fallbackText: string
  allowDataQuestions: boolean
  todayLabel: string
  appBaseUrl: string
  retrievalHasEvidence: boolean
  userName?: string | null
  userRole?: string | null
}

const VISUAL_PROTOCOL = `
Protocolo de respuestas visuales:
Cuando los datos sean mejor representados visualmente, incluye bloques visuales.
SOLO usa bloques visuales cuando tienes datos reales de herramientas, NUNCA inventes datos.

Formatos (usar delimitador ::: exactamente así):

1) GRÁFICO — tendencias, comparaciones:
:::chart
{"chartType":"bar","title":"...","labels":[...],"datasets":[{"label":"...","data":[...],"color":"#10b981"}]}
:::

2) KPIs — métricas resumidas (máx 4):
:::kpi
[{"label":"Guardias activos","value":142,"delta":"+5","deltaDirection":"up"}]
:::

3) CARDS — listar entidades con detalle:
:::cards
[{"title":"Juan Pérez","subtitle":"Mall Plaza","badge":"Activo","badgeColor":"green","action":{"type":"navigate","url":"/personas/guardias/abc"}}]
:::

4) TABLA — datos tabulares:
:::table
{"title":"...","headers":["Col1","Col2"],"rows":[["val1","val2"]]}
:::

5) SUGERENCIAS — al final, máximo 3:
:::suggestions
[{"label":"Ver pipeline","icon":"chart","action":{"type":"navigate","url":"/crm/deals"}},{"label":"Asistencia de hoy","icon":"users","action":{"type":"query","message":"¿Cómo está la asistencia?"}}]
:::

Reglas visuales:
- Gráficos cuando hay datos comparativos (mín 2 puntos de datos)
- KPIs para resúmenes ejecutivos (3-4 métricas clave)
- Cards para listar personas/instalaciones/deals (máx 6)
- Tablas para datos estructurados (máx 8 filas)
- SIEMPRE incluir sugerencias de seguimiento al final
- Combinar texto breve explicativo + visual
- chartType puede ser: "bar", "line", "pie"
- URLs relativas sin dominio (ej: /crm/deals, /ops/asistencia)
- No uses bloques visuales para respuestas simples de texto
`

export function buildHelpChatSystemPromptV2(params: BuildHelpChatSystemPromptV2Params): string {
  const basePrompt = buildHelpChatSystemPrompt({
    fallbackText: params.fallbackText,
    allowDataQuestions: params.allowDataQuestions,
    todayLabel: params.todayLabel,
    appBaseUrl: params.appBaseUrl,
    retrievalHasEvidence: params.retrievalHasEvidence,
  })

  const parts: string[] = [basePrompt]

  // User context
  if (params.userName || params.userRole) {
    const userParts: string[] = []
    if (params.userName) userParts.push(`Nombre: ${params.userName}`)
    if (params.userRole) userParts.push(`Rol: ${params.userRole}`)
    parts.push(`\nContexto del usuario actual:\n${userParts.join("\n")}`)
  }

  // Identity upgrade
  parts.push(`
Tu nombre es "OPAI Intelligence", el asistente IA premium de OPAI Suite.
Puedes consultar datos de todos los módulos (CRM, Ops, Finanzas, Personas) y presentar resultados con gráficos, KPIs, cards y tablas.

Herramientas adicionales disponibles:
- Buscar cuentas/clientes, deals, instalaciones del CRM
- Pipeline comercial con etapas y métricas
- Asistencia diaria con PPC y turnos extra
- Visitas de supervisión por supervisor y semana
- Estado de rondas: ejecuciones, programaciones, alertas
- Tickets: conteo por estado, SLA vencido
- Resumen financiero: rendiciones y DTEs
- KPIs globales del tenant`)

  // Visual protocol
  parts.push(VISUAL_PROTOCOL)

  return parts.join("\n\n")
}
