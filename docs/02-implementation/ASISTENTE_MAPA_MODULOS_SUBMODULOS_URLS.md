# Mapa Funcional Completo: Modulos, Submodulos y URLs

Este documento es base de conocimiento para el Asistente IA de OPAI Suite.
Objetivo: responder con precision sobre rutas, uso, ingreso de datos, relaciones e impacto entre modulos.

Regla de respuesta sugerida:
- Si el usuario pregunta "donde", "ruta", "URL" o "como llegar", responder con nombre funcional + URL relativa.
- Si pregunta "si hago X, que pasa con Y", explicar efecto en entidades y modulos relacionados.

Inferencia semantica sugerida (sinonimos de usuario -> flujo canónico):
- "pautas", "rol de turnos", "malla de turnos", "calendario de turnos" -> **Ops > Pauta mensual** (`/ops/pauta-mensual`).
- "turnos de hoy", "quien asistio", "presentes y ausentes" -> **Ops > Asistencia diaria** (`/ops/pauta-diaria`).
- "turnos extra", "TE", "horas extra de turno" -> **Turnos Extra** (`/te/registro`, `/te/aprobaciones`).
- "control de rondas", "puntos de control", "QR de ronda" -> **Ops > Rondas** (checkpoints/plantillas/programacion).
- "accesos", "dar/quitar permisos", "perfiles" -> **Configuracion > Usuarios/Roles**.

## Hub

- **Inicio**
  - URL: `/hub`
  - Sirve para: vista de entrada y acceso rapido a modulos.
  - Ingresa datos: no principalmente; consume resumenes.
  - Se conecta con: todos los modulos via navegacion y KPIs.

## CRM

- **Inicio CRM**
  - URL: `/crm`
  - Sirve para: resumen comercial.
- **Leads**
  - URL: `/crm/leads`
  - Sirve para: capturar prospectos y calificarlos.
  - Si creas lead: habilita conversion a cuenta/deal.
- **Cuentas**
  - URL: `/crm/accounts`
  - Sirve para: gestionar clientes/prospectos empresa.
  - Si creas cuenta: habilita instalaciones, contactos y deals.
- **Instalaciones**
  - URL: `/crm/installations`
  - Sirve para: crear sedes operativas del cliente.
  - Si creas instalacion: luego se usa en Ops (puestos, pauta, rondas).
- **Contactos**
  - URL: `/crm/contacts`
  - Sirve para: personas de relacion comercial del cliente.
- **Negocios (Deals)**
  - URL: `/crm/deals`
  - Sirve para: pipeline comercial y cierre.
- **Cotizaciones (CPQ desde CRM)**
  - URL: `/crm/cotizaciones`
  - Sirve para: construir oferta economica vinculada al negocio.

Relacion clave CRM -> Ops:
- Cuenta -> Instalacion -> Puestos/Slots -> Guardia -> Pauta/Asistencia/Rondas.

## Ops (Operaciones)

- **Inicio Ops**
  - URL: `/ops`
  - Sirve para: tablero operativo.
- **Puestos**
  - URL: `/ops/puestos`
  - Sirve para: definir puestos y estructura de cobertura.
- **Pauta mensual**
  - URL: `/ops/pauta-mensual`
  - Sirve para: planificar dotacion del mes.
  - Si asignas guardias: afecta cobertura esperada y control diario.
- **Asistencia diaria**
  - URL: `/ops/pauta-diaria`
  - Sirve para: registrar ejecucion real (presentes/ausentes/reemplazos).
  - Si registras reemplazo: puede generar impacto en turnos extra/payroll.
- **Turnos extra**
  - URL: `/ops/turnos-extra`
  - Sirve para: control y gestion operativa de TE.
- **Marcaciones**
  - URL: `/ops/marcaciones`
  - Sirve para: seguimiento de marcacion de asistencia.
- **PPC**
  - URL: `/ops/ppc`
  - Sirve para: puestos por cubrir y brechas de cobertura.
- **Rondas (dashboard)**
  - URL: `/ops/rondas`
  - Sirve para: control general de rondas.
- **Control nocturno**
  - URL: `/ops/control-nocturno`
  - Sirve para: reporte operativo nocturno por instalacion.

## Ops > Rondas (submodulos)

- **Dashboard**
  - URL: `/ops/rondas`
  - Sirve para: estado general y cumplimiento.
- **Monitoreo**
  - URL: `/ops/rondas/monitoreo`
  - Sirve para: seguimiento en ejecucion.
- **Alertas**
  - URL: `/ops/rondas/alertas`
  - Sirve para: desvíos/incumplimientos.
- **Checkpoints**
  - URL: `/ops/rondas/checkpoints`
  - Sirve para: crear puntos de control.
  - Si creas checkpoint: queda disponible para plantillas y QR.
- **Plantillas**
  - URL: `/ops/rondas/templates`
  - Sirve para: secuenciar checkpoints.
  - Si editas plantilla: afecta futuras programaciones.
- **Programacion**
  - URL: `/ops/rondas/programacion`
  - Sirve para: definir frecuencia, dias y horarios.
  - Si programas ronda: impacta monitoreo y alertas.
- **Reportes**
  - URL: `/ops/rondas/reportes`
  - Sirve para: evidencia y analisis historico.

## Personas

- **Guardias**
  - URL: `/personas/guardias`
  - Sirve para: alta y gestion de guardias.
  - Si actualizas estado de guardia: impacta asignaciones y cobertura.
- **Lista negra**
  - URL: `/personas/lista-negra`
  - Sirve para: restricciones de elegibilidad.

## Turnos Extra (TE)

- **Registro**
  - URL: `/te/registro`
- **Aprobaciones**
  - URL: `/te/aprobaciones`
- **Lotes**
  - URL: `/te/lotes`
- **Pagos**
  - URL: `/te/pagos`

Impacto:
- TE aprobado/pagado impacta costos operativos y conciliacion con payroll/procesos administrativos.

## Payroll

- **Inicio Payroll**
  - URL: `/payroll`
- **Simulador**
  - URL: `/payroll/simulator`
  - Sirve para: simular remuneraciones.
- **Parametros**
  - URL: `/payroll/parameters`
  - Sirve para: configurar reglas/parametros de calculo.

Impacto:
- Cambios de parametros alteran resultados de simulaciones y calculos asociados.

## Documentos y Presentaciones

- **Presentaciones/Envios**
  - URL: `/opai/inicio`
  - Sirve para: seguimiento comercial/documental.
- **Gestion documental**
  - URL: `/opai/documentos`
  - Sirve para: gestionar documentos y estados.
- **Templates documentos**
  - URL: `/opai/documentos/templates`
  - Sirve para: base de plantillas reutilizables.

## Configuracion

- **Home Config**
  - URL: `/opai/configuracion`
- **Usuarios**
  - URL: `/opai/configuracion/usuarios`
- **Roles**
  - URL: `/opai/configuracion/roles`
- **Integraciones**
  - URL: `/opai/configuracion/integraciones`
- **Notificaciones**
  - URL: `/opai/configuracion/notificaciones`
- **Asistente IA**
  - URL: `/opai/configuracion/asistente-ia`
- **Auditoria**
  - URL: `/opai/configuracion/auditoria`
- **Firmas**
  - URL: `/opai/configuracion/firmas`
- **Categorias plantillas**
  - URL: `/opai/configuracion/categorias-plantillas`
- **Config CRM**
  - URL: `/opai/configuracion/crm`
- **Config CPQ**
  - URL: `/opai/configuracion/cpq`
- **Config Payroll**
  - URL: `/opai/configuracion/payroll`
- **Config Ops**
  - URL: `/opai/configuracion/ops`

Impacto:
- Cambios de configuracion afectan comportamiento de modulos operativos/comerciales y permisos de acceso.

## CPQ

- **Inicio CPQ**
  - URL: `/cpq`
- **Configuracion CPQ**
  - URL: `/cpq/config`

Impacto:
- Ajustes de CPQ impactan construccion y valorizacion de cotizaciones.

## FX (UF/UTM)

- Fuente operativa: indicadores internos consumidos por la app.
- Uso: soporte de valorizacion/calculo en modulos que lo requieran.

## URLs operativas/publicas especiales

- Marcacion externa por codigo: `/marcar/[code]`
- Ronda externa por codigo: `/ronda/[code]`
- Portal postulacion: `/postulacion/[token]`

Estas rutas se usan en flujos operativos/publicos especificos y no siempre en menu lateral.
