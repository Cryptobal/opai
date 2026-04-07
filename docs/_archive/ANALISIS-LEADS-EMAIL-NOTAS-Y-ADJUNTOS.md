# Análisis: notas iniciales y adjuntos en leads por email

## Problema

1. Al reenviar un mail a leads@inbound... las **notas iniciales** del lead a veces no traen el resumen.
2. Muchos correos llevan **adjuntos** (bases de licitación, PDFs, etc.) y la IA **no los lee**.
3. Se quiere que la IA analice los adjuntos y extraiga: número de guardias, puestos, horarios, vehículo a proveer, boletas de garantía, y todo lo relevante para la licitación.

## Por qué no se recogieron bien los datos en “notas iniciales”

### 1. La extracción solo usa asunto + cuerpo del email

- En `src/app/api/webhook/inbound-email/route.ts` se llama a `extractLeadFromEmail()` con:
  - `subject`, `html`, `text`, `from`
- **No se pasa ningún contenido de adjuntos.** Los adjuntos se descargan y suben a R2 **después** de crear el lead (solo para guardarlos como archivos enlazados al lead).
- Si la licitación está en un PDF/Word adjunto (“te adjunto las bases”), el cuerpo del mail tiene poco texto → la IA no tiene de dónde sacar el resumen ni los datos estructurados.

### 2. El “resumen” depende del texto que ve la IA

- En `src/lib/email-lead-extractor.ts` el campo `summary` es “resumen ejecutivo en 2-5 oraciones”.
- Si el cuerpo solo dice “adjunto bases” o “solicito cotización según documento”, la IA devuelve un summary muy genérico o vacío.
- En fallback (si la extracción falla) se usa solo el **asunto** como summary (`subject`).

### 3. Cómo se arma el campo `notes` del lead

- En `inbound-email/route.ts` (líneas 131-139) las notas del lead se construyen así:
  - `extracted.summary` (primero)
  - + “Cobertura: …”, “Duración: …”, “Guardias por turno: …”, “Puntos a cubrir: …”, “Inicio estimado: …”, “Giro: …”
- Si `summary` viene vacío o muy corto, las “notas iniciales” quedan solo con esos campos sueltos (y solo si la IA los extrajo del cuerpo). Si los datos están en el adjunto, no se extraen.

### 4. Nombre en UI: “Notas iniciales” vs “Resumen del negocio”

- En `CrmLeadDetailClient.tsx` (tab Deals, aprobación) el textarea se llama **“Notas iniciales”** y su valor es `lead.notes`.
- Conceptual y funcionalmente ese campo es el **resumen del negocio / licitación** (qué pide el cliente, alcance, requisitos). Tiene más sentido llamarlo **“Resumen del negocio”** y tratarlo como el lugar donde debe estar el análisis de la licitación (incluyendo lo extraído de adjuntos).

## Resumen de causas

| Causa | Detalle |
|-------|--------|
| Adjuntos no entran a la IA | Solo se usa subject + body; los archivos se guardan pero no se leen. |
| Resumen vacío cuando todo está en adjunto | Cuerpo escueto → summary genérico o solo asunto en fallback. |
| “Notas iniciales” = resumen del negocio | El nombre actual no deja claro que ahí debe ir el análisis de la licitación. |

## Qué habría que implementar

### A. Incluir adjuntos en la extracción

1. **En el webhook** (antes de crear el lead):
   - Descargar adjuntos (igual que ahora).
   - Para cada adjunto que sea **texto extraíble** (PDF, DOCX, TXT, etc.):
     - Extraer texto (p. ej. PDF con librería o enviar PDF en base64 a la IA como ya hace `ai-service` para protocolos).
     - O enviar el PDF en base64 a la IA si el proveedor lo soporta (OpenAI/Anthropic/Google con visión/documentos).
   - Pasar a `extractLeadFromEmail()` un nuevo parámetro, p. ej. `attachmentContents: { fileName, textOrBase64, mimeType }[]`.

2. **En el extractor** (`email-lead-extractor.ts`):
   - Aceptar `attachmentContents`.
   - Incluir en el prompt un bloque tipo “Documentos adjuntos (licitación/bases): …” con el texto o indicando que hay N PDFs para analizar (y pasarlos por API si usamos visión/documentos).
   - Instruir a la IA: usar asunto + cuerpo + adjuntos para rellenar todos los campos y, sobre todo, el **resumen del negocio/licitación**.

### B. Enriquecer el “resumen” como análisis de licitación

- En el schema de extracción (y en el prompt), definir que el campo `summary` sea un **“Resumen del negocio / licitación”** que debe incluir, cuando aparezca en el mail o en adjuntos:
  - Número de guardias (total y por turno si aplica).
  - Puestos / ubicaciones a cubrir.
  - Horarios y cobertura (24/7, solo días hábiles, etc.).
  - Si se debe proveer vehículo.
  - Boletas de garantía u otros requisitos documentales.
  - Plazos, inicio estimado, duración.
- Opcional: añadir campos estructurados (ej. `requiresVehicle: boolean`, `guaranteeBonds: string`, etc.) si se quiere rellenar formularios o filtros desde el CRM.

### C. Cambio de nombre en UI

- En la pantalla de aprobación del lead, cambiar la etiqueta de **“Notas iniciales”** a **“Resumen del negocio”** (y opcionalmente el placeholder: “Resumen de la licitación / solicitud (guardias, puestos, horarios, requisitos…)…”).
- Dejar claro que ese campo puede venir prellenado por la IA a partir del correo y de los adjuntos.

## Orden sugerido de implementación

1. **Fase 1 – Adjuntos en la extracción**
   - Descargar adjuntos en el webhook antes de llamar al extractor.
   - Extraer texto de PDF (y si ya hay, de DOCX/TXT) o pasar PDF base64 a la IA.
   - Añadir `attachmentContents` a `extractLeadFromEmail` y actualizar prompt + schema para que el `summary` sea un resumen del negocio que use también los adjuntos.

2. **Fase 2 – Resumen del negocio**
   - Ajustar prompt y descripción del campo `summary` para que sea explícitamente “resumen del negocio/licitación” con guardias, puestos, horarios, vehículo, boletas de garantía, etc.
   - Opcional: campos estructurados adicionales para licitación.

3. **Fase 3 – UI**
   - Renombrar “Notas iniciales” → “Resumen del negocio” en el formulario de aprobación del lead.

Si quieres, el siguiente paso puede ser bajar esto a tareas concretas (archivos a tocar, firma de `extractLeadFromEmail`, y ejemplo de prompt para adjuntos).
