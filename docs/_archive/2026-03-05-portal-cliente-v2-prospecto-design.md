# Portal del Cliente v2.0 — Modo Prospecto

**Fecha:** 2026-03-05
**Estado:** Aprobado

---

## Principio Central

Un solo portal, un solo layout. La diferencia entre prospecto y activo es solo la fuente de datos (demo vs real) + algunas secciones extra para el prospecto.

## Navegacion

### Bottom Nav (identico ambos modos)

Dashboard | Instalaciones | Rondas | Posta | Mas

### Menu "Mas" — Prospecto

Chat, Tickets, Documentos, Cotizaciones, Reportes, Comparativa, Alertas, **Personal**, **Propuesta**, **Nosotros**, **Empresa**

### Menu "Mas" — Activo

Chat, Tickets, Documentos, Cotizaciones, Reportes, Comparativa, Alertas, **Personal**, **Empresa** (sin Nosotros ni Propuesta)

---

## Dashboard — Diferencias en Prospecto

- **Arriba del todo:** Cards de cotizaciones pendientes con monto, resumen de puestos, botones "Aceptar propuesta" y "Ver detalle"
  - **Mobile:** Carousel horizontal (swipe) con dots indicadores, una card visible a la vez
  - **Desktop:** Grid de cards (2-3 por fila)
- **Resto:** Mismos KPIs, graficos, actividad — datos demo hardcodeados + badge "Vista previa"

---

## Secciones con Datos Demo (Prospecto)

Todas las secciones operativas muestran datos hardcodeados (constantes en codigo) + badge "Vista previa":

- Dashboard (KPIs, graficos, actividad)
- Instalaciones
- Rondas
- Posta
- Personal (guardias con documentos demo: OS-10, antecedentes)
- Tickets
- Reportes
- Comparativa
- Alertas

Los datos demo son identicos para todos los prospectos, definidos como constantes en `lib/portal/demo-data.ts`.

Se elimina el uso del sistema de generacion demo con IA (tabla `PortalClienteDemoData` queda pero no se usa).

---

## Secciones Solo Prospecto

### Propuesta

Lista de todos los negocios (Deals) activos del prospecto, cada uno con sus cotizaciones:

- Header por negocio: nombre, etapa actual, fecha
- Cotizacion activa (ultima enviada) destacada:
  - ID (CPQ-xxxx), monto mensual UF/CLP
  - Breakdown de puestos y guardias
  - Descripcion del servicio
  - Lista de incluidos (control acceso, rondas GPS, CCTV, bitacora, supervisor, portal)
  - Boton "Descargar PDF" (mismo formato vista previa CPQ)
  - Boton "Aceptar propuesta" (ver flujo abajo)
  - Boton "Consultar" (abre chat con ejecutivo)
- Cotizaciones anteriores del mismo negocio colapsadas (historial)
- Multiples negocios = secciones separadas

### Nosotros

Showroom institucional de Gard Security (desaparece cuando pasa a activo):

- Hero con logo, nombre y tagline
- Cifras clave: anhos experiencia, clientes activos, guardias certificados, retencion
- Diferenciadores: tecnologia propia (OPAI), gamificacion, portal del cliente, respuesta inmediata
- Certificaciones: OS-10, D.S. 44, ISO 45001, ACHS

---

## Secciones Reales en Ambos Modos

### Empresa

Formulario editable sincronizado con CRM. Visible en ambos modos (prospecto y activo):

**Datos de cuenta:**
- Razon social, RUT empresa, direccion

**Representantes legales** (1 o mas):
- Nombre, RUT
- Boton "Agregar representante legal"
- Cada representante genera tokens para plantillas de contrato

**Personeria:**
- Fecha escritura
- Tipo: escritura publica | sociedad | empresa en un dia
- Notaria

**Contactos asociados:**
- Nombre, email, cargo (editables)

**Instalaciones:**
- Nombre y ubicacion (editables por el cliente)

Cualquier cambio se sincroniza al CRM (actualizacion bidireccional).

### Personal

**Modo activo:** Lista de guardias asignados a la(s) instalacion(es):
- Por guardia: nombre, avatar, turno, status
- Al expandir: documentos cargados (OS-10 y Cert. antecedentes destacados, resto de docs visibles)
- Se actualiza automaticamente cuando se sube un documento desde OPAI

**Modo prospecto:** Misma estructura visual con datos demo + badge "Vista previa". Explicacion de que veran documentacion completa de cada guardia.

### Chat

**Prospecto:** Canal real 1-a-1 con ejecutivo asignado. Demas canales listados pero bloqueados ("Disponible cuando estes activo" + candado).

**Activo:** Todos los canales activos (instalacion publico + conversaciones 1-a-1 con cualquier usuario Gard).

### Cotizaciones

Datos reales del CRM en ambos modos.

---

## Tour Guiado

### Comportamiento

- Auto-trigger 1.2 segundos despues del primer login
- Se guarda `portalTourShown` en Account
- Repetible desde boton "Tour" en header
- Navegacion: Siguiente, Atras, Saltar
- Progress bar con 10 segmentos

### Implementacion

Componente custom (no libreria). Modal centrado con overlay blur, ~150 lineas.

### 10 Pasos

1. Bienvenida — centro de control personalizado
2. Cotizaciones — propuestas activas, revisar y aceptar
3. Dashboard — KPIs operacionales (datos reales en produccion)
4. Gamificacion — scorecard por guardia con ranking
5. Bitacora — registro digital de novedades
6. Chat — comunicacion directa con equipo Gard
7. Tickets — solicitudes con SLA garantizado
8. Reportes — informes mensuales automaticos
9. Datos simulados — disclaimer de datos demo
10. Cierre — invitacion a explorar y contactar ejecutivo

### UI del Tour

- Overlay oscuro con blur (`backdrop-filter`)
- Card centrada con gradiente
- Iconos animados (bounceIn)
- Sombra teal
- Animaciones: fadeIn, slideUp, bounceIn, pulse

---

## Flujos

### Flujo "Enviar por Portal del Cliente" (CPQ)

1. Boton nuevo en paso 5 del CPQ junto a "Enviar cotizacion"
2. Si Account no tiene status prospect ni active → set `status = 'prospect'`
3. Asigna `portalEjecutivoId` = usuario que envia
4. Si contacto principal no tiene PIN → genera PIN de 6 digitos, habilita `portalEnabled`
5. Crea canal chat 1-a-1 (ejecutivo <-> contacto)
6. Envia email al contacto: RUT + PIN + link al portal
7. Registra en audit log

### Flujo "Aceptar propuesta" (Portal)

1. Prospecto presiona "Aceptar propuesta" en una cotizacion
2. Modal de confirmacion
3. Deal → etapa "Ganado"
4. Account → `status = 'client_active'`
5. Crear canal chat instalacion publico (cliente + guardias + equipo Gard)
6. Crear canal chat instalacion interno (solo usuarios Gard)
7. Canal 1-a-1 con ejecutivo se mantiene
8. Email a comercial@gard.cl informando aceptacion
9. Notificacion al ejecutivo en OPAI
10. Datos demo desaparecen (status cambio = datos reales)

### Transicion Prospecto → Activo

Puede ocurrir por:
- Prospecto acepta propuesta desde el portal (flujo anterior)
- Deal cambia a "Ganado" manualmente en CRM
- Admin cambia status de Account manualmente

En todos los casos se ejecutan los mismos pasos (crear canales, etc).

---

## Modelo de Datos — Cambios

### Campos nuevos en CrmAccount

- `portalEjecutivoId` (Int?, FK → User) — ejecutivo asignado para chat prospecto
- `portalTourShown` (Boolean, default false)

### Nuevo modelo: AccountRepresentanteLegal

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | String (cuid) | PK |
| tenantId | String | FK tenant |
| accountId | String | FK → CrmAccount |
| nombre | String | Nombre completo |
| rut | String | RUT del representante |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Tokens de contrato: `{{rep_legal_N_nombre}}`, `{{rep_legal_N_rut}}`

### Nuevo modelo: AccountPersoneria

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | String (cuid) | PK |
| tenantId | String | FK tenant |
| accountId | String | FK → CrmAccount |
| fechaEscritura | DateTime | Fecha de la escritura |
| tipoEscritura | String | escritura_publica, sociedad, empresa_en_un_dia |
| notaria | String | Nombre de la notaria |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Sin cambios

- CrmContact (ya tiene portalPin, portalEnabled, etc.)
- CrmInstallation (ya tiene los campos necesarios)
- PortalClienteDemoData (tabla queda, deja de usarse)

---

## Datos Demo Hardcodeados

Archivo: `src/lib/portal/demo-data.ts`

Constantes identicas para todos los prospectos:

- DEMO_KPI: cumplimiento 97.3%, rondas 24/28, trust score 8.6, alertas 2
- DEMO_CHART_DATA: array 30 valores de cumplimiento
- DEMO_GUARDIAS: 4 guardias con score, rondas, puntualidad, meses
- DEMO_BITACORA: 4 entradas (Normal, Alerta, Info)
- DEMO_MODULOS: 6 modulos con icono y descripcion
- DEMO_CHAT_CHANNELS: 4 canales bloqueados
- DEMO_GUARDIAS_INSTALACION: 2 guardias con turno y status
- DEMO_PERSONAL: 2-3 guardias con documentos demo (OS-10, antecedentes, etc.)
- DEMO_RONDAS: datos de rondas simuladas
- DEMO_POSTA: datos de cambios de turno simulados
- DEMO_INSTALACIONES: 1-2 instalaciones ficticias

---

## Diseno UI

### Paleta

- Fondo principal: #0b1120
- Cards: gradiente 145deg #1E293B → #1A2332
- Acento teal: #2dd4bf / #14b8a6
- Texto principal: #f0fdf4
- Texto secundario: rgba(255,255,255,0.6)
- Border sutil: rgba(255,255,255,0.06)

### Tipografia

DM Sans, pesos 400-800

### Componentes clave

- PreviewBadge: "Vista previa" con punto verde + borde teal
- Cards: border-radius 14px, border hover teal + translateY(-2px)
- CTA buttons: gradiente teal 135deg, border-radius 10-12px
- Cotizacion cards: carousel mobile (swipe + dots), grid desktop

### Animaciones

- fadeIn, slideUp, bounceIn (tour), pulse (indicadores)

---

## Decisiones Validadas

1. Un solo layout para prospecto y activo (no dos portales distintos)
2. Datos demo hardcodeados (no IA)
3. Reusar account.status existente como discriminador
4. Tour custom (no libreria)
5. Representantes legales como modelo separado (1 o mas)
6. Personeria como modelo separado
7. Seccion Empresa editable visible en ambos modos
8. Chat real 1-a-1 con ejecutivo en prospecto
9. Al aceptar: Deal→Ganado automatico + crear canales + email
10. Hook en CPQ para "Enviar por Portal"
