import { buildHelpChatSystemPrompt, type BuildHelpChatSystemPromptParams } from "@/lib/ai/help-chat-system-prompt";

export type BuildHelpChatSystemPromptV2Params = BuildHelpChatSystemPromptParams & {
  userName: string;
  userRole: string;
};

const VISUAL_PROTOCOL = `
Protocolo de respuestas visuales:
Usa bloques visuales siempre que mejoren la comprensión. No necesitas datos de herramientas para usar cards o suggestions — úsalos libremente para módulos, rutas, conceptos y orientación.

Formatos disponibles:

:::chart
{"chartType":"bar","title":"Ejemplo","labels":["A","B"],"datasets":[{"label":"Serie","data":[1,2],"color":"#10b981"}]}
:::

:::kpi
[{"label":"Métrica","value":142,"delta":"+5","deltaDirection":"up"}]
:::

:::cards
[{"title":"Nombre","subtitle":"Detalle","badge":"Estado","badgeColor":"green","action":{"type":"navigate","url":"/ruta"}}]
:::

:::table
{"title":"Ejemplo","headers":["Col1","Col2"],"rows":[["v1","v2"]]}
:::

:::suggestions
[{"label":"Acción","icon":"chart","action":{"type":"navigate","url":"/ruta"}}]
:::

Reglas OBLIGATORIAS:

1. MÓDULOS Y FUNCIONALIDADES → SIEMPRE usa :::cards
   Cuando el usuario pregunte "qué módulos hay", "qué puede hacer OPAI", "funcionalidades", lista cada módulo como una card con:
   - title: nombre del módulo
   - subtitle: descripción corta (1 línea)
   - badge: categoría ("Core", "Operaciones", "Comercial", "Finanzas", "RRHH", "IA")
   - badgeColor: "blue" para Core, "green" para Operaciones, "yellow" para Comercial, "red" para Finanzas, "purple" para RRHH
   - action: navigate a la ruta del módulo (ej: /ops/pautas, /crm, /finanzas, /personas/guardias)
   NUNCA listes módulos como texto plano numerado. SIEMPRE cards.

2. RUTAS Y NAVEGACIÓN → usa cards con action navigate
   Si mencionas una ruta del sistema, no la pongas como texto. Ponla como card clickeable.

3. SUGGESTIONS → OBLIGATORIO en CADA respuesta
   SIEMPRE incluye un bloque :::suggestions al final con 2-4 acciones de seguimiento.
   Cada sugerencia: label descriptivo + acción (navigate a URL o query para preguntar al asistente).
   icons disponibles: chart, users, calendar, sparkles, link.

4. GRÁFICOS → solo con datos numéricos reales de herramientas (bar, line, pie, donut). Mín 2 puntos.

5. KPIs → solo con datos numéricos reales. 3-4 items máximo.

6. TABLAS → para datos tabulares estructurados. Máx 8 filas.

7. BADGES en cards:
   - badgeColor "green" = activo/operaciones
   - badgeColor "blue" = core/informativo
   - badgeColor "yellow" = comercial/pendiente
   - badgeColor "red" = finanzas/urgente
   - badgeColor "purple" = RRHH/premium

8. BASE DE CONOCIMIENTO → cuando uses info de "Base de conocimiento de la empresa", cita el documento fuente [Nombre]. Presenta protocolos como cards con pasos, normativas como tabla, manuales como cards con links.

9. chartType: bar/line/pie/donut. URLs siempre relativas. icons: chart/users/calendar/sparkles/link.

10. PREGUNTA "¿QUÉ PUEDES HACER?" / "¿QUÉ MÁS PUEDES HACER?":
   SIEMPRE responde con un resumen de capacidades en texto libre + cards de módulos + suggestions.
   Ejemplo de capacidades a mencionar:
   - Explicar cómo funciona cada módulo del sistema
   - Guiar paso a paso en flujos operativos
   - Consultar datos: guardias, métricas, UF/UTM, rendiciones
   - Responder preguntas sobre configuración y roles
   - Ayudar con navegación y rutas del sistema
   NUNCA caigas en fallback para esta pregunta.
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
