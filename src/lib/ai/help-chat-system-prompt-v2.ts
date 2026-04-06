import { buildHelpChatSystemPrompt, type BuildHelpChatSystemPromptParams } from "@/lib/ai/help-chat-system-prompt";

export type BuildHelpChatSystemPromptV2Params = BuildHelpChatSystemPromptParams & {
  userName: string;
  userRole: string;
};

const VISUAL_PROTOCOL = `
Protocolo de respuestas visuales:
Solo incluye bloques visuales cuando tienes datos reales de herramientas, NUNCA inventes datos.

:::chart
{"chartType":"bar","title":"Ejemplo","labels":["A","B"],"datasets":[{"label":"Serie","data":[1,2],"color":"#10b981"}]}
:::

:::kpi
[{"label":"Métrica","value":142,"delta":"+5","deltaDirection":"up"}]
:::

:::cards
[{"title":"Nombre","subtitle":"Detalle","badge":"Estado","badgeColor":"green","action":{"type":"navigate","url":"/opai/inicio"}}]
:::

:::table
{"title":"Ejemplo","headers":["Col1","Col2"],"rows":[["v1","v2"]]}
:::

:::suggestions
[{"label":"Acción","icon":"chart","action":{"type":"navigate","url":"/opai/inicio"}}]
:::

Reglas de bloques visuales:
- Gráficos para comparaciones (mín 2 puntos). KPIs para resúmenes (3-4). Cards para entidades con acciones (máx 6). Tablas para datos tabulares (máx 8 filas).
- chartType: bar/line/pie/donut. URLs siempre relativas. icons: chart/users/calendar/sparkles/link.
- SIEMPRE incluye un bloque :::suggestions al final de cada respuesta con 2-4 acciones de seguimiento. Cada sugerencia debe tener un label descriptivo y una acción (navigate a una URL del sistema o query para preguntar algo al asistente).
- Cuando uses información de la "Base de conocimiento de la empresa", cita el nombre del documento fuente entre corchetes [Nombre]. Presenta la información en cards cuando sea apropiado (protocolos → cards con pasos, normativas → tabla con reglas, manuales → lista con links).
- Si la respuesta incluye rutas o módulos del sistema, usa cards con acción navigate para que el usuario pueda ir directamente.
- Los badges en cards deben reflejar estado o categoría: usa badgeColor "green" para activo/listo, "yellow" para pendiente, "blue" para informativo, "red" para urgente.
`.trim();

export function buildHelpChatSystemPromptV2(params: BuildHelpChatSystemPromptV2Params): string {
  const base = buildHelpChatSystemPrompt(params);
  const { userName, userRole } = params;

  return `${base}

Contexto del usuario actual:
- Nombre: ${userName}
- Rol: ${userRole}

${VISUAL_PROTOCOL}
`.trim();
}
