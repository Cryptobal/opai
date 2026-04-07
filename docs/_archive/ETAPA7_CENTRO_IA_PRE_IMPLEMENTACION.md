# ETAPA 7 — RONDAS 2.0: Centro de Inteligencia Artificial

## Reporte Pre-Implementación

---

## 1. Verificación Etapas 1-6

| Etapa | Estado |
|-------|--------|
| 1. Database y Models | ✅ |
| 2. API y Lógica de Negocio | ✅ |
| 3. Página Guardia (Standalone) | ✅ |
| 4. OPAI Configuración | ✅ |
| 5. Monitoreo y Alertas | ✅ |
| 6. Reportes y Exportación | ✅ |

---

## 2. Integración IA existente

### 2.1 `AIService` (`src/lib/ai-service.ts`)
- Clase centralizada multi-provider (Anthropic, OpenAI, Google).
- Lee config activa de `AiProvider` table (API key encriptada).
- Métodos: `generateJSON(prompt, maxTokens)`, `processDocument(pdf, prompt)`, `testConnection(config)`.
- **Ideal para recomendaciones IA** — reutilizar `generateJSON()`.

### 2.2 OpenAI directo (`src/lib/openai.ts`)
- Instancia OpenAI con `OPENAI_API_KEY` (env var).
- Usado por `control-nocturno-ai.ts` para generar resúmenes ejecutivos con `gpt-4o-mini`.

### 2.3 Control Nocturno AI (`src/lib/control-nocturno-ai.ts`)
- Patrón a seguir: recoge datos → construye prompt → llama a OpenAI → retorna texto.
- Útil como referencia, pero usaremos `AIService.generateJSON()` para coherencia multi-provider.

### 2.4 Cierre de turno (Etapa 5)
- `CerrarTurnoModal` → llama a `/api/ops/rondas/monitoreo/turno/[id]/close`.
- La API genera `aiSummary` (placeholder). **Se puede mejorar con `AIService` real.**

**Decisión:** Usar `AIService.generateJSON()` para recomendaciones IA. Fallback graceful si no hay provider configurado.

---

## 3. Motor de alertas (`alert-engine.ts`)

### Umbrales hardcoded actuales:
```ts
const ALERT_CONFIG = {
  staticGuardMinutes: 5,
  speedAnomalyKmh: 15,
  routeDeviationMultiplier: 2,
};
```

### Alertas implementadas:
1. **breach_geocerca** — usa `routeDeviationMultiplier`
2. **guardia_estatico** — usa `staticGuardMinutes`
3. **velocidad_anomala** — usa `speedAnomalyKmh`
4. **checkpoint_saltado** — siempre activo en modo `strict`
5. **ronda_no_iniciada** — usa `toleranciaMinutos` de la programación

### Cambios necesarios:
- Reemplazar `ALERT_CONFIG` constante con lectura desde `Setting` table.
- Añadir checks de `enabled` antes de evaluar cada tipo de alerta.
- La función `evaluatePostMarkAlerts` recibirá `tenantId` → buscar config.

---

## 4. Almacenamiento de configuración

### Modelo existente: `Setting`
```prisma
model Setting {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String
  type      String
  category  String?
  tenantId  String?
  tenant    Tenant?
}
```

**Estrategia:** Usar key `rondas_ia_config` con `type: "json"`, `category: "ops"`, JSON en `value`.

```json
{
  "staticGuardMinutes": 5,
  "staticGuardEnabled": true,
  "speedAnomalyKmh": 15,
  "speedAnomalyEnabled": true,
  "roundNotStartedMinutes": 10,
  "roundNotStartedEnabled": true,
  "checkpointSkippedEnabled": true,
  "routeDeviationMultiplier": 2,
  "routeDeviationEnabled": true
}
```

**No requiere migración** — usa tabla existente.

---

## 5. Sidebar / Navegación

### Actual `RONDAS_ITEMS`:
```ts
const RONDAS_ITEMS = [
  { key: "rondas-dashboard", href: "/ops/rondas", label: "Dashboard" },
  { key: "rondas-monitoreo", href: "/ops/rondas/monitoreo", label: "Monitor" },
  { key: "rondas-alertas", href: "/ops/rondas/alertas", label: "Alertas" },
  { key: "rondas-config", href: "/ops/rondas/configuracion", label: "Config" },
  { key: "rondas-reportes", href: "/ops/rondas/reportes", label: "Reportes" },
];
```

**Cambio:** Agregar `{ key: "rondas-ia", href: "/ops/rondas/centro-ia", label: "Centro IA", icon: Brain }`.

---

## 6. Plan de Archivos

```
src/
├── app/(app)/ops/rondas/centro-ia/
│   └── page.tsx                           # Server: auth, fetch config, pasar a client
├── app/api/ops/rondas/ia/
│   ├── config/route.ts                    # GET/PUT config de umbrales
│   └── recommendations/route.ts           # POST: genera recomendaciones IA
├── components/ops/rondas/
│   ├── RondasCentroIaClient.tsx           # Layout 2 columnas + sección Trust Score
│   ├── IaUmbralesConfig.tsx               # Card de configuración de umbrales
│   └── IaRecommendations.tsx              # Card de recomendaciones IA
├── lib/rondas/
│   ├── alert-engine.ts                    # MODIFICAR: leer config dinámica
│   └── ia-config.ts                       # Nuevo: helper para leer/escribir config
```

---

## 7. Detalle por componente

### IaUmbralesConfig
- 5 filas editables: toggle + input numérico
- Botón "Guardar configuración"
- Fetch `GET /api/ops/rondas/ia/config` al montar
- Submit `PUT /api/ops/rondas/ia/config`

### IaRecommendations
- Botón "Regenerar recomendaciones"
- Estado: loading → lista de cards con prioridad (alta/media/baja)
- Fetch `POST /api/ops/rondas/ia/recommendations`
- Graceful fallback: si IA no configurada, mostrar mensaje informativo

### Sección Trust Score (educativa)
- 5 columnas visuales con peso %, nombre, descripción
- Estático, no requiere API

### API `POST /api/ops/rondas/ia/recommendations`
1. Recopilar datos 4 semanas: rondas/instalación, trust/guardia, cobertura/checkpoint, alertas/hora
2. Enviar a `AIService.generateJSON()` con system + user prompt
3. Parsear array de recomendaciones JSON
4. Fallback si `NO_AI_CONFIGURED`: retornar recomendaciones algorítmicas básicas

---

## 8. Integración con alert-engine.ts

### Nuevo helper: `ia-config.ts`
```ts
export async function getAlertConfig(tenantId: string): Promise<AlertConfig>
// Lee Setting con key "rondas_ia_config" y tenantId
// Si no existe, retorna defaults
```

### Cambio en `alert-engine.ts`
- `evaluatePostMarkAlerts` ahora recibe o lee `AlertConfig`
- Cada check tiene guard: `if (!config.staticGuardEnabled) skip`
- Valores dinámicos en vez de constantes

---

## 9. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| IA no configurada | Fallback algorítmico: generar recomendaciones sin IA basadas en reglas simples |
| Setting no existe aún | Crear con defaults en `GET` si no existe (upsert pattern) |
| Prompt muy grande | Limitar datos a top 10 instalaciones, top 10 guardias, top 20 checkpoints |
| alert-engine performance | Config se lee 1 vez por ejecución de `evaluatePostMarkAlerts`, no por alerta |

---

## 10. Confirmación requerida

1. ¿Aprobar plan y estructura de archivos?
2. La columna `key` de `Setting` es `@unique` global (no por tenant). ¿Usar key compuesta como `rondas_ia_config_{tenantId}` o buscar por `key + tenantId`?
   - **Recomendación:** Usar `key = "rondas_ia_config"` + filtrar por `tenantId` con `findFirst({ where: { key, tenantId } })` para soportar multi-tenant. El `@unique` en `key` es un constraint existente — crearemos con `upsert` usando el `id` del setting.

---

*Reporte generado como paso previo a la implementación de la Etapa 7.*
