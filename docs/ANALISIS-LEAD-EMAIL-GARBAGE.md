# Análisis: Lead creado mal desde email a leads@inbound

## Contexto del correo

Se enviaron **dos correos** a Leads (leads@inbound.gard.cl):

1. **14:30** – Carlos Irigoyen reenvía el correo original de Jaime Muñoz (SICE) con toda la solicitud:
   - Empresa: SICE AGENCIA CHILE S.A
   - RUT: 59.090.630-1
   - Contacto: Jaime Muñoz Burgos, Adquisiciones, jomunozb@sice.com
   - Solicitud: 2 direcciones, servicio 24/7, 1 guardia por turno, 4 guardias

2. **18:26** – Carlos envía un correo con texto de autocompletado/1Password:
   ```
   angelica.bruna@polpaicosoluciones.cl. Pulsa el tabulador para insertarlo.
   El menú de 1Password está disponible. Pulsa la fecha hacia abajo para seleccionar.
   ```

## Cómo debería haberse creado el lead (si se procesó el correo correcto)

Si se hubiera procesado el correo de las **14:30** (reenvío de SICE), el lead debería tener:

| Campo | Valor esperado |
|-------|----------------|
| **Empresa** | SICE AGENCIA CHILE S.A |
| **RUT** | 59.090.630-1 |
| **Nombre** | Jaime |
| **Apellido** | Muñoz Burgos |
| **Email** | jomunozb@sice.com |
| **Teléfono** | +56 9 6237 3606 |
| **Cargo** | Adquisiciones |
| **Dirección** | Dardignac #160, Recoleta |
| **Giro** | Otros servicios de telecomunicaciones |
| **Resumen** | Cotización vigilancia 24/7, 2 direcciones (Dardignac 160, Brisas del Maipo 0127), 1 guardia por turno, 4 guardias totales |
| **Guardias por turno** | 1 |
| **Puntos a cubrir** | 2 |

## Por qué salió mal

### Hipótesis principal: se procesó el correo incorrecto (18:26)

El correo de las **18:26** es basura (autocompletado de 1Password). Si ese fue el que llegó a leads@inbound.gard.cl y disparó el webhook:

1. **Remitente**: Carlos Irigoyen Garcés \<carlos.irigoyen@gard.cl\>
2. **Cuerpo**: texto de 1Password sin datos de lead
3. **Extracción**: la IA recibe ese texto y devuelve campos vacíos o incoherentes
4. **Fallback**: si la extracción falla, se usa el remitente (Carlos) como contacto → lead con datos de Carlos, no del cliente real

### Flujo actual del extractor

```
email.from = carlos.irigoyen@gard.cl
→ fromDomainIsOwn = true
→ isForwarded = true
→ extractFirstForwardedBlockAndContext() 
   → No hay marcador "Forwarded message" en el cuerpo
   → firstBlock = todo el texto (el garbage de 1Password)
→ La IA recibe ese garbage
→ Devuelve JSON vacío o incoherente
→ criticalEmpty = true → log de warning
→ O si hay parse error → emptyResult() con Carlos como contacto
```

### Problemas identificados

1. **No hay filtro de correos basura**: Cualquier correo que llegue a leads@inbound crea un lead, aunque sea spam, autocompletado o error.
2. **Detección de contenido inválido**: Textos como "Pulsa el tabulador", "1Password", etc. no se detectan como no-lead.
3. **Posible confusión de correos**: Si Carlos envió el 18:26 en lugar del 14:30 (o ambos), el sistema procesa ambos y crea leads; el malo puede ser el más reciente o el que el usuario ve primero.

## Solución propuesta

### 1. Filtro de correos basura (pre-extracción)

Antes de llamar a `extractLeadFromEmail`, detectar y **rechazar** correos que claramente no son solicitudes de lead:

- Cuerpo muy corto (< 80 caracteres) **y** contiene patrones de autocompletado:
  - "1Password", "Pulsa el tabulador", "Pulsa la fecha", "menú de 1Password"
  - "Insertar", "autocompletar", "sugerencia"
- Cuerpo que es solo un email suelto + texto de accesibilidad (ej. "email@x.com. Pulsa el tabulador...")

Si se detecta → responder `skipped: "garbage_content"` y **no crear lead**.

### 2. Umbral de contenido mínimo

Si el cuerpo (después de strip HTML) tiene menos de 50 caracteres y no hay adjuntos relevantes → considerar rechazar o marcar como "revisión manual".

### 3. Mejorar el prompt para contenido inválido

Instruir a la IA: si el texto no parece una solicitud de servicio (solo un email, texto de accesibilidad, etc.), devolver un campo especial `_invalidContent: true` para que el webhook rechace el lead.

### 4. Documentación para usuarios

En la doc de Resend Inbound: avisar que no se deben enviar correos de prueba, autocompletado o mensajes vacíos a leads@inbound.

## Orden de implementación

1. **Fase 1**: Añadir `isGarbageEmail()` en `email-lead-extractor.ts` con los patrones de basura.
2. **Fase 2**: En `inbound-email/route.ts`, llamar a `isGarbageEmail()` antes de `extractLeadFromEmail`; si es basura → `return { success: true, skipped: "garbage_content" }`.
3. **Fase 3** (opcional): Añadir umbral de longitud mínima del cuerpo.

---

## Correcciones adicionales (análisis profundo)

### Problema: matching de destinatario fallaba

Cuando se envía a **"Leads"** como contacto, el campo `to` puede venir como `"Leads <leads@inbound.gard.cl>"`. La comparación anterior hacía `replace(/\s/g, "")` y comparaba con `"leads@inbound.gard.cl"`, resultando en `"leads<leads@inbound.gard.cl>" !== "leads@inbound.gard.cl"` → **skipped: wrong_recipient** para todos los correos.

**Fix**: Extraer el email de direcciones tipo `"Name <email>"` antes de comparar.

### Problema: respuestas (reply) vs reenvíos (forward)

Si Carlos **responde** al correo de Jaime añadiendo "Leads" como destinatario (en lugar de reenviar), el formato es distinto:
- No hay "---------- Forwarded message ----------"
- Hay "On [date], [name] wrote:" o "El [date], [name] escribió:"
- El mensaje original está citado con ">"

**Fix**: Añadir `extractQuotedReplyBlock()` para detectar y extraer el bloque citado en respuestas.

### Problema: patrones de basura incompletos

Solo teníamos patrones en español. Clientes en inglés (1Password, etc.) usan "Press tab to insert", "Press arrow to select".

**Fix**: Ampliar `GARBAGE_PATTERNS` con variantes en inglés.
