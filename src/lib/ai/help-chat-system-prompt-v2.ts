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

Reglas: gráficos para comparaciones (mín 2 puntos), KPIs para resúmenes (3-4), cards para entidades (máx 6), tablas (máx 8 filas). SIEMPRE sugerencias al final. chartType: bar/line/pie/donut. URLs relativas. icons: chart/users/calendar/sparkles/link.
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
