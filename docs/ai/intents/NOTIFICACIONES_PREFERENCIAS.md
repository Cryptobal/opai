# Intent: Notificaciones y preferencias

> **Creado:** 2026-02-18

## Intencion del usuario

Preguntas como:
- "Como configuro mis notificaciones?"
- "Puedo desactivar las notificaciones por email?"
- "Que tipos de notificaciones hay?"
- "No quiero recibir emails de leads"

## Respuesta esperada

### Configurar preferencias
1. Ir a **Perfil > Notificaciones** (`/opai/perfil/notificaciones`).
2. Veras una lista de tipos de notificacion agrupados por modulo.
3. Para cada tipo, puedes activar/desactivar:
   - **Bell** (campana en la app)
   - **Email** (correo electronico)
4. Solo ves tipos de los modulos a los que tienes acceso.

### Tipos de notificacion (23 tipos en 4 modulos)

**CRM:**
- Nuevo lead, lead aprobado, mencion, email abierto/clicked/bounced, follow-up enviado/programado/fallido

**CPQ:**
- Cotizacion enviada, cotizacion vista

**Documentos:**
- Contrato requerido, contrato por vencer, contrato vencido, firma completada

**Operaciones:**
- Documento de guardia por vencer/vencido, nueva postulacion
- Ticket creado, aprobado, rechazado, SLA breached, SLA approaching

### Canales
- **Bell:** notificacion dentro de la app (campana en la barra superior)
- **Email:** correo electronico con template OPAI

## URLs canonicas

- Preferencias: `/opai/perfil/notificaciones`

## Formato recomendado

- "Puedes configurar tus notificaciones en Perfil > Notificaciones."
- Accion: `Ingresa aca: [Notificaciones](https://opai.gard.cl/opai/perfil/notificaciones)`
