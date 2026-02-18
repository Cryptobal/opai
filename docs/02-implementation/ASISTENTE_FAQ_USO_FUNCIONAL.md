# FAQ de Uso Funcional para Asistente IA

> **Actualizado:** 2026-02-18

Esta guía es la base funcional para respuestas del asistente dentro de OPAI Suite.
Está enfocada en cómo usar el sistema en operación diaria, ventas y administración.
Complemento recomendado para respuestas con URL y dependencias cruzadas:
- `docs/02-implementation/ASISTENTE_MAPA_MODULOS_SUBMODULOS_URLS.md`

## Vista global del sistema

### ¿Cómo funciona globalmente OPAI Suite?
OPAI Suite integra módulos comerciales y operativos conectados:
1. **CRM**: clientes, prospectos, contactos, negocios e instalaciones.
2. **CPQ**: creación de cotizaciones y estructura de servicio.
3. **Ops**: puestos, pauta mensual, asistencia diaria, turnos extra, marcaciones, rondas, tickets.
4. **Personas/Guardias**: alta, estado laboral, documentación, asignaciones y PIN de marcación.
5. **Payroll**: simulación y parámetros de cálculo de remuneraciones.
6. **Documentos y Presentaciones**: plantillas, propuestas, seguimiento, firma digital y exportación.
7. **Finanzas**: rendiciones de gastos, aprobaciones, pagos y exportación bancaria.
8. **Notificaciones**: bell + email con 23 tipos y preferencias por usuario.
9. **Configuración**: usuarios, roles, permisos e integraciones.

Relación central:
**Cuenta/Cliente -> Instalación -> Puestos/Slots -> Guardia -> Pauta mensual -> Asistencia diaria -> Turnos extra / Marcación / Rondas / Tickets**

## Mapa rápido de rutas por flujo

- **CRM (clientes y leads)**: `CRM > Cuentas` y `CRM > Prospectos`.
- **CPQ (cotizaciones)**: `CPQ`.
- **Guardias (alta/gestión)**: `Ops > Personas > Guardias`.
- **Pauta mensual**: `Ops > Pauta mensual`.
- **Asistencia diaria**: `Ops > Asistencia diaria`.
- **Marcaciones**: `Ops > Marcaciones`.
- **Rondas**: `Ops > Rondas` (Checkpoints, Plantillas, Programación, Monitoreo, Alertas, Reportes).
- **Tickets**: `Ops > Tickets`.
- **Control nocturno**: `Ops > Control nocturno`.
- **Finanzas**: `Finanzas > Rendiciones`, `Finanzas > Aprobaciones`, `Finanzas > Pagos`.
- **Notificaciones (preferencias)**: `Perfil > Notificaciones`.
- **Payroll**: `Payroll`.
- **FX (UF/UTM)**: `FX`.
- **Documentos**: `Documentos`.
- **Presentaciones**: `Presentaciones`.
- **Configuración (usuarios/roles/permisos)**: `Configuración`.

## CRM: cuentas, prospectos, contactos y negocios

### ¿Se pueden ingresar nuevos clientes?
Sí. En CRM puedes registrar nuevas cuentas como **prospecto** o **cliente**.

### ¿Cómo ingreso nuevos clientes?
1. Entra a **CRM**.
2. Abre **Cuentas**.
3. Presiona **+** (Nueva cuenta).
4. Selecciona tipo (**Prospecto** o **Cliente**).
5. Completa datos principales.
6. Guarda.

### ¿Cómo ingreso un nuevo prospecto (lead)?
1. Entra a **CRM**.
2. Abre **Prospectos**.
3. Presiona **+** (Nuevo lead).
4. Completa empresa, contacto y canal de origen.
5. Guarda para iniciar el flujo comercial.

### ¿Cómo paso un prospecto a cliente?
1. Entra a **CRM > Leads** y abre el prospecto.
2. Ejecuta la acción de **convertir/cambiar a cliente** según la vista habilitada.
3. Completa los datos obligatorios de cuenta (e instalación si aplica).
4. Guarda cambios.
5. Valida en **CRM > Cuentas** que el registro ya aparece como cliente.

Impacto:
- Habilita continuidad comercial en **Deals/Cotizaciones** y preparación operativa en instalaciones/Ops.

### ¿Cómo se relaciona CRM con Ops?
Desde CRM defines cuentas, negocios e instalaciones. En Ops usas esas instalaciones para operar puestos, guardias, pauta, marcación y rondas.

## CPQ: cotizaciones

### ¿Para qué sirve CPQ?
Sirve para construir y valorar cotizaciones de servicio con estructura operativa y costos asociados.

### ¿Qué datos usa CPQ?
Usa información de clientes/instalaciones y parámetros económicos del sistema para estimar y presentar propuestas.

## Personas y guardias

### ¿Cómo ingreso nuevos guardias?
1. Entra a **Ops**.
2. Abre **Personas > Guardias**.
3. Presiona **+** para alta manual.
4. Completa identificación, contacto, dirección y datos laborales.
5. Guarda.

### ¿Qué estados puede tener un guardia?
Los estados funcionales son: **postulante**, **seleccionado**, **contratado activo**, **inactivo** y **desvinculado**.

### ¿Cómo asigno un PIN de marcación a un guardia?
1. Ve a la ficha del guardia en **Personas > Guardias > [guardia]**.
2. Busca la sección **Marcación**.
3. Presiona **Asignar PIN** (genera PIN aleatorio que se muestra una sola vez).

## Ops: puestos, pauta y asistencia

### ¿Cómo armo una pauta mensual?
1. Entra a **Ops > Pauta mensual**.
2. Verifica puestos y slots activos por instalación.
3. Asigna guardias a slots.
4. Define o aplica serie/rotación.
5. Guarda la planificación.

### ¿Qué necesito antes de armar la pauta?
- Instalaciones y puestos operativos configurados.
- Guardias disponibles para asignación.
- Esquema de turnos/serie definido.

### ¿Qué diferencia hay entre pauta mensual y asistencia diaria?
- **Pauta mensual**: planificación.
- **Asistencia diaria**: ejecución real (presencias, ausencias, reemplazos).

## Marcación digital

### ¿Cómo marca un guardia su entrada/salida?
1. El guardia abre el link de marcación en su celular (vía QR o link directo `/marcar/[code]`).
2. Ingresa su **RUT** y **PIN** (4-6 dígitos).
3. El sistema captura la **geolocalización** del celular.
4. Si está dentro del radio de la instalación, puede marcar **Entrada** o **Salida**.
5. Recibe comprobante por email automáticamente.

### ¿Qué pasa si el guardia no tiene GPS?
Sin GPS = no puede marcar. La geolocalización es obligatoria. Si está fuera del radio = marcación rechazada.

### ¿Cómo genero el QR de una instalación?
1. Ve a la ficha de la instalación en CRM.
2. Busca sección **Marcación digital**.
3. Presiona **Generar código**.
4. Descarga/imprime el QR generado.

## Rondas: checkpoints, plantillas, programación y QR

### ¿Dónde se gestionan las rondas?
En **Ops > Rondas** (dashboard, monitoreo, alertas, checkpoints, plantillas, programación y reportes).

### ¿Cómo se gestiona una ronda de principio a fin?
1. Crear checkpoints por instalación.
2. Armar plantilla con orden de checkpoints.
3. Programar frecuencia, días y horarios.
4. Monitorear ejecución y alertas.
5. Revisar reportes de cumplimiento.

### ¿Cómo armo checkpoints?
1. Ve a **Ops > Rondas > Checkpoints**.
2. Selecciona instalación.
3. Crea checkpoint con nombre y parámetros.
4. Guarda.

### ¿De dónde saco los QR de rondas?
Desde la tabla de **Checkpoints**, en la acción de generar/visualizar QR.

### ¿Cómo armo una plantilla de ronda?
1. Ve a **Ops > Rondas > Plantillas**.
2. Selecciona instalación.
3. Agrega checkpoints y define orden.
4. Guarda plantilla.

### ¿Cómo programo una ronda?
1. Ve a **Ops > Rondas > Programación**.
2. Elige plantilla activa.
3. Define días, horarios y frecuencia.
4. Guarda programación.

### ¿Las rondas se generan solas?
Sí. Un cron cada 10 minutos genera automáticamente las rondas programadas.

## Tickets

### ¿Cómo creo un ticket?
1. Ve a **Ops > Tickets**.
2. Presiona **+ Nuevo ticket**.
3. Selecciona tipo de ticket.
4. Completa descripción y datos requeridos.
5. Guarda. Si requiere aprobación, queda en "Pendiente de aprobación".

### ¿Qué es el SLA de un ticket?
Cada tipo de ticket tiene un tiempo máximo de resolución. Si se excede, el ticket se marca como "SLA breached" y se notifica al equipo.

### ¿Un guardia puede crear tickets?
Sí, desde el portal de guardia (`/portal/guardia/tickets`). Solo ve tipos con origen "guard" o "both".

## Notificaciones

### ¿Cómo configuro mis notificaciones?
1. Ve a **Perfil > Notificaciones** (`/opai/perfil/notificaciones`).
2. Para cada tipo, activa/desactiva **Bell** (campana) y **Email**.
3. Solo ves tipos de módulos a los que tienes acceso.

### ¿Qué tipos de notificaciones hay?
23 tipos en 4 módulos: CRM (leads, emails, follow-ups), CPQ (cotizaciones), Documentos (contratos), Operaciones (tickets, SLA, guardias, postulaciones).

## Finanzas: rendiciones y aprobaciones

### ¿Dónde gestiono rendiciones?
En **Finanzas > Rendiciones** (`/finanzas/rendiciones`).

### ¿Dónde apruebo rendiciones pendientes?
En **Finanzas > Aprobaciones** (`/finanzas/aprobaciones`).

### ¿Qué pasa cuando una rendición se aprueba?
La rendición avanza en su estado administrativo y queda disponible para flujo de pago según reglas del tenant.

### ¿Cómo exporto pagos al banco?
En **Finanzas > Pagos**, selecciona rendiciones aprobadas y exporta en formato ABM Santander.

## Payroll

### ¿Para qué sirve Payroll en la plataforma?
Para simulación y apoyo en cálculos de remuneraciones con parámetros vigentes.

### ¿Qué relación tiene con Ops?
Payroll se alimenta de datos operacionales como asistencia/turnos extra y parámetros económicos vigentes.

## FX: UF y UTM

### ¿La plataforma maneja UF y UTM?
Sí. El sistema sincroniza valores de UF (diaria) y UTM (mensual) automáticamente desde SBIF/SII.

## Documentos y Presentaciones

### ¿Qué se puede hacer en Documentos?
Gestionar plantillas con tokens dinámicos, generar documentos, controlar versiones, firma digital y exportar a PDF.

### ¿Qué se puede hacer en Presentaciones?
Armar propuestas comerciales B2B, enviar por email con tracking, compartir por WhatsApp, y monitorear vistas.

## Acceso desde celular (Home Screen)

### ¿Cómo "descargo" OPAI en mi teléfono?
OPAI se usa como **aplicación web**. No necesitas App Store/Play Store para uso base.
Puedes crear un acceso directo a `https://www.opai.gard.cl` en la pantalla de inicio.

### iPhone (Safari)
1. Abre `https://www.opai.gard.cl` en Safari.
2. Pulsa **Compartir**.
3. Elige **Añadir a pantalla de inicio**.
4. Pulsa **Añadir**.

### iPhone (Chrome/Edge)
1. Abre `https://www.opai.gard.cl` en Chrome o Edge.
2. Usa **Compartir** y selecciona **Añadir a pantalla de inicio**.
3. Si no aparece la opción, abre el sitio en Safari y usa el flujo de Safari.

### Android (Chrome)
1. Abre `https://www.opai.gard.cl` en Chrome.
2. Pulsa menú **⋮**.
3. Elige **Añadir a pantalla principal** o **Instalar app**.
4. Confirma con **Añadir/Instalar**.

### Android (Samsung Internet / Edge / Firefox)
1. Abre `https://www.opai.gard.cl`.
2. Abre el menú del navegador.
3. Elige **Añadir a pantalla de inicio** (o equivalente).
4. Confirma.

## Configuración: usuarios, roles y permisos

### ¿Dónde se administra acceso?
En **Configuración**, donde se gestionan usuarios, roles, permisos e integraciones activas.

### ¿Qué roles existen?
13 roles con permisos granulares por módulo. Los principales son: owner, admin, editor, viewer, operaciones, rrhh, reclutamiento, finanzas, supervisor.

## Criterio de respuesta del asistente

- Responder en lenguaje funcional, claro y conversacional.
- Priorizar explicaciones accionables sobre el uso real del sistema.
- Cuando el usuario pida ruta/URL, responder con enlace completo y clickeable en formato:
  - `Ingresa acá: [Abrir enlace](https://dominio/ruta)`
- No usar formato textual `- URL: /ruta`.
- En pasos operativos, cada paso debe indicar:
  - acción concreta,
  - resultado esperado,
  - enlace de acceso cuando aplique.
- No inventar datos duros ni afirmar información no verificable.
- Si falta contexto verificable para una pregunta específica, usar:
  - "No tengo suficiente información para asegurar esto. ¿Quieres que te deje la pregunta para hacerla al administrador? Cópiala y pégala tal cual: ..."
