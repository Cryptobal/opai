# FAQ de Uso Funcional para Asistente IA

Esta guía es la base funcional para respuestas del asistente dentro de OPAI Suite.
Está enfocada en cómo usar el sistema en operación diaria, ventas y administración.
Complemento recomendado para respuestas con URL y dependencias cruzadas:
- `docs/02-implementation/ASISTENTE_MAPA_MODULOS_SUBMODULOS_URLS.md`

## Vista global del sistema

### ¿Cómo funciona globalmente OPAI Suite?
OPAI Suite integra módulos comerciales y operativos conectados:
1. **CRM**: clientes, prospectos, contactos, negocios e instalaciones.
2. **CPQ**: creación de cotizaciones y estructura de servicio.
3. **Ops**: puestos, pauta mensual, asistencia diaria, turnos extra, marcaciones y rondas.
4. **Personas/Guardias**: alta, estado laboral, documentación y asignaciones.
5. **Payroll**: simulación y parámetros de cálculo de remuneraciones.
6. **Documentos y Presentaciones**: plantillas, propuestas, seguimiento y exportación.
7. **Configuración**: usuarios, roles, permisos e integraciones.

Relación central:
**Cuenta/Cliente -> Instalación -> Puestos/Slots -> Guardia -> Pauta mensual -> Asistencia diaria -> Turnos extra / apoyo a Payroll**

## Mapa rápido de rutas por flujo

- **CRM (clientes y leads)**: `CRM > Cuentas` y `CRM > Prospectos`.
- **CPQ (cotizaciones)**: `CPQ`.
- **Guardias (alta/gestión)**: `Ops > Personas > Guardias`.
- **Pauta mensual**: `Ops > Pauta mensual`.
- **Asistencia diaria**: `Ops > Asistencia diaria`.
- **Marcaciones**: `Ops > Marcaciones`.
- **Rondas**: `Ops > Rondas` (Checkpoints, Plantillas, Programación, Monitoreo, Alertas, Reportes).
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

### ¿Cómo se relaciona CRM con Ops?
Desde CRM defines cuentas, negocios e instalaciones. En Ops usas esas instalaciones para operar puestos, guardias y pauta.

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

## Marcación digital

### ¿Dónde se marcan entradas/salidas?
En el flujo de marcación habilitado para guardias según configuración de instalación y control operacional.

### ¿Qué valida la marcación?
Depende de configuración, pero puede incluir identificación del guardia, PIN y reglas de contexto operacional.

## Payroll

### ¿Para qué sirve Payroll en la plataforma?
Para simulación y apoyo en cálculos de remuneraciones con parámetros vigentes.

### ¿Qué relación tiene con Ops?
Payroll se alimenta de datos operacionales como asistencia/turnos extra y parámetros económicos vigentes.

## FX: UF y UTM

### ¿La plataforma maneja UF y UTM?
Sí. El sistema mantiene valores de UF y UTM para operaciones que lo requieren.

### ¿Para qué se usan UF/UTM?
Se usan en módulos que necesitan referencias económicas para cálculo y valorización.

## Documentos y Presentaciones

### ¿Qué se puede hacer en Documentos?
Gestionar plantillas y documentos operacionales/comerciales con contenido estructurado y control de uso.

### ¿Qué se puede hacer en Presentaciones?
Armar propuestas/presentaciones y dar seguimiento de interacción según el flujo comercial habilitado.

## Configuración: usuarios, roles y permisos

### ¿Dónde se administra acceso?
En **Configuración**, donde se gestionan usuarios, roles, permisos e integraciones activas.

### ¿Qué roles existen?
Depende de políticas activas del tenant, con control de acceso por módulo y capacidades.

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
