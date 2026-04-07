# OPAI Intelligence — Asistente IA conversacional

> **Actualizado:** 2026-04-07

Este directorio define la estructura operativa para **OPAI Intelligence**, el asistente IA conversacional de OPAI Suite (también referenciado como "help-chat" en el código).

- `intents/`: playbooks por flujo (preguntas de usuario -> respuesta esperada -> pasos).
- `exceptions/`: manejo de casos borde y respuestas de contingencia.
- `test-sets/`: preguntas canónicas para validar calidad de respuestas.

## Capacidades del asistente

### 1. Conversación funcional
- Explica módulos, flujos, conceptos y navegación de OPAI.
- Responde sobre rutas funcionales, paso a paso, y relaciones entre módulos.
- Cita la base de conocimiento (RAG) cuando hay protocolos/normativas relevantes.

### 2. Búsqueda federada de entidades (search-first)
Cuando el usuario menciona un nombre propio, código o RUT no reconocido, el asistente
**está obligado a buscar antes de pedir reformulación**. Tools disponibles:

- `search_accounts` — clientes y prospectos CRM (devuelve cards con link a la ficha).
- `search_deals` — negocios CRM (con etapa, monto, cuenta).
- `search_installations` — instalaciones (con dirección, ciudad, supervisor).
- `search_quotes` — cotizaciones CPQ (con código, monto, vigencia, estado).
- `search_guardias` — guardias por nombre, RUT o código.

Resultados se renderizan como **cards horizontales scrollables** con CTA "Ver detalle".

### 3. Contexto de página (Notion-like)
Cuando el usuario está viendo la ficha de un cliente, deal, cotización, instalación,
guardia o documento, el asistente **sabe automáticamente qué entidad es** y resuelve
referencias ambiguas ("este cliente", "este contrato", "resúmeme esto") sin pedirlas.
Un pill **"Hablando sobre: …"** aparece en el header del chat.

Fichas con contexto registrado:
- Cliente CRM (`crm_account`)
- Deal CRM (`crm_deal`)
- Instalación CRM (`crm_installation`)
- Cotización CPQ (`cpq_quote`)
- Guardia Ops (`ops_guardia`)
- Documento (`doc_document`)

### 4. Lectura y resumen de documentos
- `get_entity_documents(entityType, entityId)` — lista documentos asociados a una
  entidad. Hace UNION de tres fuentes:
  - **Documentos generados** (Tiptap, módulo Documentos: contratos, anexos).
  - **Archivos adjuntos CRM** (PDF/DOCX subidos por usuarios: órdenes de compra,
    facturas, propuestas).
  - **Adjuntos de cotización CPQ**.
- `read_document(documentId)` — extrae el texto plano del documento. Soporta:
  - Documentos Tiptap (texto enriquecido del módulo Documentos).
  - PDF (`pdf-parse`).
  - DOCX (`mammoth`).
  - TXT y Markdown.
  - Truncado a 12.000 caracteres.
- El asistente entrega resúmenes estructurados (partes / objeto / vigencia / montos /
  obligaciones críticas) y nunca expone el texto crudo completo.

### 5. Datos operativos en vivo
- `get_uf_utm` — UF y UTM del día desde DB.
- `get_guardias_metrics` — métricas agregadas de guardias.
- `get_pending_rendiciones` — rendiciones por aprobar.
- `get_daily_attendance` / `get_daily_absences` / `get_extra_shifts` — operación diaria.
- `get_supervision_visits` / `get_rondas_status` — operación de terreno.
- `get_panic_alerts` — alertas de pánico recientes.
- `get_tickets_summary` — tickets por estado.
- `get_finance_summary` — resumen financiero (DTE, rendiciones).
- `get_deal_pipeline` — pipeline comercial agregado.
- `get_account_detail` / `get_guardia_detail` — fichas completas.
- `list_account_documents` / `list_guardia_documents` — listados específicos.

### 6. Renderizado visual estructurado
El asistente puede responder con bloques visuales en lugar de texto plano:
- `:::cards` — carrusel horizontal de cards (con badge, meta, CTA).
- `:::chart` — gráficos bar/line/pie/donut.
- `:::kpi` — tarjetas de métricas con delta.
- `:::table` — tablas estructuradas.
- `:::suggestions` — botones de seguimiento (siempre presentes al final).

### 7. UX de tool en curso
Cuando el asistente ejecuta una tool, el widget muestra un indicador específico
("Buscando clientes…", "Leyendo documento…", etc) en lugar de un genérico "pensando…".

## Lo que el asistente NO hace (out of scope)

- **No ejecuta acciones de escritura.** No crea, edita ni elimina entidades. No envía
  emails ni WhatsApp ni firma documentos. Solo lee y orienta.
- **No accede a sistemas externos** (Banco, SII, AFP, OS10) a menos que el dato esté
  en la DB del tenant.
- **No procesa imágenes ni hace OCR.** Solo extrae texto de PDF/DOCX/TXT/MD nativos.
- **No lee Excel (XLSX) ni PowerPoint (PPTX)** todavía.
- **No persiste preferencias del usuario** más allá del historial de conversación.
- **No tiene memoria entre tenants**: cada respuesta está aislada al `tenantId` del usuario.

## Módulos cubiertos por intents/playbooks

| Módulo | Intents | Estado |
|--------|---------|:------:|
| CRM | Prospectos, cuentas, contactos, deals | ✅ |
| CPQ | Cotizaciones | ✅ |
| Ops | Puestos, pauta, asistencia, PPC, turnos extra | ✅ |
| Marcación | Marcación digital, PIN, QR | ✅ |
| Rondas | Checkpoints, plantillas, programación, monitoreo | ✅ |
| Tickets | Creación, SLA, aprobaciones | ✅ |
| Notificaciones | Preferencias, canales | ✅ |
| Finanzas | Rendiciones, aprobaciones, pagos | ✅ |
| Personas | Guardias, documentos, lista negra | ✅ |
| Payroll | Simulador, parámetros | ✅ |
| Documentos | Templates, firma digital, lectura/resumen | ✅ |
| Configuración | Usuarios, roles, permisos | ✅ |

## Archivos clave en el código

- `src/lib/ai/help-chat-system-prompt-v2.ts` — system prompt con reglas de búsqueda, cards, formato de moneda, contexto de página y documentos.
- `src/lib/ai/help-chat-tools-v2.ts` — definiciones y ejecución de todas las tools.
- `src/lib/ai/help-chat-visual-types.ts` — parser de bloques visuales.
- `src/app/api/ai/help-chat/stream/route.ts` — endpoint SSE (streaming + tool loop + pageContext).
- `src/components/opai/AiHelpChatWidgetV2.tsx` — widget React (carrusel, pill de contexto, indicador de tool).
- `src/components/opai/ChatPageContextProvider.tsx` — provider + hook `useRegisterChatPageContext`.

## Documentos de soporte

- `docs/02-implementation/ASISTENTE_FAQ_USO_FUNCIONAL.md` — FAQ funcional completo
- `docs/02-implementation/ASISTENTE_MAPA_MODULOS_SUBMODULOS_URLS.md` — Mapa de URLs y módulos

## Objetivo de calidad

1. Responder la mayoría de preguntas funcionales con pasos accionables.
2. Incluir enlaces claros para navegar a cada flujo.
3. Usar datos reales cuando la pregunta requiera verificación (nunca inventar).
4. Mantener formato consistente:
   - Para qué sirve
   - Dónde está
   - Cómo se usa
   - Qué impacta

## Cadencia recomendada

- Semanal: revisar preguntas no resueltas/fallback.
- Convertir cada gap en:
  - nuevo alias/intención,
  - ajuste de tool de datos (si aplica),
  - documento en `intents/`,
  - caso de prueba en `test-sets/`.
