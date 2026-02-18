# Etapa 3 — Marcación de Asistencia Digital

> **Fecha:** 2026-02-12 (creación) | 2026-02-18 (última actualización)  
> **Estado:** ✅ Completado (PR-1 a PR-5). Pendientes: items de certificación DT (PR-6)  
> **Dependencias:** Fase 1 (Ops + TE + Personas) ✅  
> **Normativa:** Resolución Exenta N°38, DT Chile (26/04/2024)

---

## A. Objetivo

Implementar un sistema propio de marcación de asistencia digital para guardias, integrado nativamente en OPAI, que:

1. Cumpla con la **Resolución Exenta N°38** de la Dirección del Trabajo
2. Permita a los guardias marcar entrada/salida desde un **link web** (sin app nativa)
3. Use **dos métodos de identificación no biométricos**: RUT+PIN y geolocalización
4. Alimente automáticamente la tabla `OpsAsistenciaDiaria` existente
5. Genere registros inmutables con hash de integridad y sello de tiempo
6. Permita futura certificación ante la DT por un tercero independiente

---

## B. Normativa aplicable

### Resolución Exenta N°38 (09/05/2024)

| Requisito | Cómo se cumple en OPAI |
|---|---|
| Al menos 2 métodos de identificación | RUT+PIN (conocimiento) + Geolocalización (ubicación) |
| Un método NO puede ser biométrico | Ninguno es biométrico |
| Checksum/Hash por marcación | SHA-256 automático sobre cada registro |
| Sello de tiempo electrónico | Timestamp del servidor (UTC) en cada marcación |
| Transmisión en línea a BD central | HTTPS → PostgreSQL (Neon) en tiempo real |
| Portal de fiscalización DT | Página web con acceso por credenciales para fiscalizador |
| Alertas de jornada | Notificación cuando se excede límite legal de horas |
| Seguridad anti-adulteración | Hash de integridad, registros inmutables, auditoría |
| Acceso del trabajador a sus datos | El guardia puede ver sus marcaciones desde el link |
| Protección de datos personales | PIN hasheado (bcrypt), sin biometría, Ley 19.628 |

### Camino a certificación

1. Desarrollar módulo dentro de OPAI (esta etapa)
2. Contratar **pre-certificación** con certificador independiente (Ciberlegal, Veltec, Bizpartners, etc.)
3. Corregir brechas identificadas
4. **Certificación completa** (6-8 semanas de auditoría)
5. Presentar informe a DT → Ordinario de autorización (2 años de vigencia)

---

## C. Diseño funcional

### C.1 Dos escenarios operativos

**Escenario A — Teléfono de la empresa en la instalación:**
1. Celular corporativo queda en la garita con el link abierto
2. El guardia llega, ingresa RUT + PIN
3. El sistema captura geolocalización (siempre correcta, teléfono fijo)
4. Marca "Entrada" o "Salida"
5. Sistema registra: guardia, hora, coordenadas, instalación, hash

**Escenario B — Guardia usa su propio teléfono:**
1. QR impreso en la instalación con URL única
2. El guardia escanea el QR → se abre link en navegador
3. Ingresa RUT + PIN
4. El navegador pide permiso de ubicación
5. El sistema valida que esté dentro del radio de la instalación (`geoRadiusM`)
6. Marca "Entrada" o "Salida"

### C.2 Capas de seguridad anti-fraude

El sistema implementa 3 capas de protección para evitar que un guardia marque sin estar físicamente en la instalación:

**Capa 1 — Geolocalización OBLIGATORIA y BLOQUEANTE:**
- Sin GPS = no puedes marcar. Si el guardia niega el permiso de ubicación, el botón de marcar queda deshabilitado.
- Si la ubicación está fuera del radio de la instalación (`geoRadiusM`, default 100m) = **marcación rechazada por el servidor** (no solo warning).
- El GPS se solicita automáticamente al abrir la pantalla de marcación.
- Esto elimina el fraude por foto del QR: aunque tengas el link, si no estás ahí, no marcas.

**Capa 2 — Foto de evidencia (NO biométrica):**
- Al marcar, el sistema abre la **cámara frontal** del celular y captura una foto.
- La foto NO se usa para reconocimiento facial (no es biométrica).
- Es evidencia visual que el supervisor puede revisar en caso de duda.
- Efecto disuasivo: si sabes que te toman foto, no intentas marcar desde otro lado.
- La foto se almacena vinculada al registro de marcación.

**Capa 3 — QR rotativo (futuro, para teléfonos corporativos):**
- En vez de un QR estático, el teléfono corporativo muestra un QR que cambia cada 5 minutos.
- Si alguien fotografía el QR, en 5 minutos expira.
- Implementación planificada para un PR futuro.

### C.3 Flujo de marcación (con seguridad)

```
[Guardia abre link / escanea QR]
       │
       ▼
[Pantalla: RUT + PIN]
       │
       ▼
[API: Validar RUT+PIN]──── Error → "RUT o PIN incorrecto"
       │
       ▼ OK
[Solicitar geolocalización]──── Denegado → BLOQUEADO "Activa tu ubicación"
       │
       ▼ GPS obtenido
[Abrir cámara frontal]──── Opcional: capturar foto de evidencia
       │
       ▼
[Botón: Marcar Entrada/Salida]
       │
       ▼
[API: Registrar marcación]
  ├── Verifica lat/lng OBLIGATORIO
  ├── Calcula distancia a instalación (Haversine)
  ├── Si distancia > geoRadiusM → RECHAZADO (403)
  ├── Genera hash SHA-256
  ├── Guarda OpsMarcacion + foto de evidencia
  ├── Actualiza OpsAsistenciaDiaria (checkInAt / checkOutAt)
  └── Retorna confirmación
       │
       ▼
[Pantalla: Confirmación]
  ├── ✅ "Entrada registrada a las 08:02"
  ├── 📍 "Ubicación validada (25m)"
  ├── Hash de integridad
  └── Botón "Ver mis marcaciones"
```

### C.4 Validaciones

| Validación | Detalle |
|---|---|
| RUT válido | Formato y dígito verificador chileno |
| PIN correcto | Comparación bcrypt contra PIN almacenado |
| Guardia activo | `lifecycleStatus` = `seleccionado` o `contratado_activo` |
| No en lista negra | `isBlacklisted = false` |
| Guardia asignado a instalación | Tiene asignación activa en la instalación del link |
| Geolocalización OBLIGATORIA | Sin GPS = no puede marcar. Fuera de `geoRadiusM` = **RECHAZADO** (no warning) |
| No duplicada | No puede marcar dos entradas sin salida intermedia |
| Horario razonable | Warning si marca fuera del horario del puesto |

---

## D. Modelo de datos

### D.1 Cambios a modelos existentes

**OpsGuardia** — agregar campo:
```prisma
marcacionPin String? @map("marcacion_pin") // bcrypt hash del PIN de 4-6 dígitos
```

**CrmInstallation** — agregar campo:
```prisma
marcacionCode String? @unique @map("marcacion_code") // código único 8 chars para URL/QR
```

**Relaciones nuevas:**
- `OpsGuardia.marcaciones → OpsMarcacion[]`
- `CrmInstallation.marcaciones → OpsMarcacion[]`

### D.2 Nuevo modelo: OpsMarcacion

```prisma
model OpsMarcacion {
  id              String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId        String   @map("tenant_id")
  guardiaId       String   @map("guardia_id") @db.Uuid
  installationId  String   @map("installation_id") @db.Uuid
  puestoId        String?  @map("puesto_id") @db.Uuid
  slotNumber      Int?     @map("slot_number")
  tipo            String   // "entrada" | "salida"
  timestamp       DateTime @default(now()) @db.Timestamptz(6)
  lat             Float?
  lng             Float?
  geoValidada     Boolean  @default(false) @map("geo_validada")
  geoDistanciaM   Float?   @map("geo_distancia_m")
  metodoId        String   @default("rut_pin") @map("metodo_id")
  fotoEvidenciaUrl String? @map("foto_evidencia_url") // foto capturada al marcar
  ipAddress       String?  @map("ip_address")
  userAgent       String?  @map("user_agent")
  hashIntegridad  String   @map("hash_integridad") // SHA-256
  asistenciaId    String?  @map("asistencia_id") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  guardia      OpsGuardia          @relation(fields: [guardiaId], references: [id])
  installation CrmInstallation     @relation(fields: [installationId], references: [id])
  puesto       OpsPuestoOperativo? @relation(fields: [puestoId], references: [id])

  @@index([tenantId], map: "idx_ops_marcaciones_tenant")
  @@index([guardiaId], map: "idx_ops_marcaciones_guardia")
  @@index([installationId, timestamp], map: "idx_ops_marcaciones_inst_ts")
  @@index([timestamp], map: "idx_ops_marcaciones_timestamp")
  @@map("marcaciones")
  @@schema("ops")
}
```

---

## E. APIs

### E.1 APIs públicas (sin autenticación de sesión)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/public/marcacion/validar` | Valida RUT+PIN, retorna nombre del guardia e instalación |
| `POST` | `/api/public/marcacion/registrar` | Registra marcación con geolocalización |
| `GET` | `/api/public/marcacion/estado?code=X&rut=Y` | Estado actual del guardia (¿marcó entrada?) |
| `GET` | `/api/public/marcacion/mis-marcaciones?code=X&rut=Y&pin=Z` | Historial de marcaciones del guardia |

**Seguridad de APIs públicas:**
- Rate limiting por IP (máx. 10 intentos/minuto)
- El `code` de instalación es un string aleatorio de 8 caracteres (no predecible)
- El PIN se transmite hasheado o por HTTPS
- Bloqueo temporal tras 5 intentos fallidos consecutivos

### E.2 APIs admin (con autenticación)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/ops/marcacion/pin` | Asignar/resetear PIN de guardia |
| `GET` | `/api/ops/marcacion/reporte` | Reporte de marcaciones por instalación/fecha |
| `POST` | `/api/ops/installations/[id]/generar-codigo` | Generar/regenerar código de marcación |

---

## F. Frontend

### F.1 Página pública de marcación

**Ruta:** `/marcar/[code]`

Página mobile-first, sin autenticación, accesible por QR o link directo.

**Pantallas:**
1. **Identificación:** Campo RUT (formato XX.XXX.XXX-X) + Campo PIN (4-6 dígitos, oculto)
2. **Marcación:** Muestra nombre del guardia, instalación, hora actual. Botones "Marcar Entrada" / "Marcar Salida" según estado.
3. **Confirmación:** Hora registrada, estado de geolocalización, enlace a historial.
4. **Historial:** Lista de marcaciones del guardia en esa instalación (últimos 30 días).

**UX:**
- Mobile-first, funciona en cualquier celular con navegador
- Sin app nativa, sin instalación
- Geolocation API del navegador (pide permiso una vez)
- Botones grandes, feedback visual claro
- Funciona offline parcial (muestra error si no hay conexión)

### F.2 Admin — Gestión de PIN (en ficha del guardia)

En la ficha existente del guardia (`/personas/guardias/[id]`):
- Nueva sección "Marcación" con:
  - Estado del PIN: "Configurado" / "Sin PIN"
  - Botón "Asignar PIN" → genera PIN aleatorio y lo muestra una vez
  - Botón "Resetear PIN" → genera nuevo PIN
  - El PIN solo se muestra al momento de generarlo (después solo se indica si tiene o no)

### F.3 Admin — QR de instalación (en ficha de instalación)

En la ficha existente de instalación (`/crm/accounts/[id]/installations/[id]`):
- Nueva sección "Marcación digital" con:
  - Código de marcación: `ABC12XYZ`
  - URL de marcación: `https://opai.gard.cl/marcar/ABC12XYZ`
  - QR generado (SVG/PNG) con opción de descargar/imprimir
  - Botón "Regenerar código" (invalida el anterior)
  - Radio de geofence configurable (default 100m)

---

## G. Integración con OpsAsistenciaDiaria

Cuando un guardia marca entrada o salida, el sistema:

1. Busca el registro de `OpsAsistenciaDiaria` correspondiente:
   - Misma fecha, mismo `installationId`, guardia como `plannedGuardiaId` o `actualGuardiaId`
2. Si encuentra:
   - Marcación "entrada" → actualiza `checkInAt`
   - Marcación "salida" → actualiza `checkOutAt`
   - Si `attendanceStatus` era "pendiente" → cambia a "asistio"
3. Si no encuentra (guardia no planificado en pauta):
   - Registra la marcación igualmente en `OpsMarcacion` (evidencia)
   - No modifica `OpsAsistenciaDiaria`
   - Genera alerta para supervisor

---

## H. Hash de integridad

Cada registro de `OpsMarcacion` incluye un campo `hashIntegridad` calculado como:

```
SHA-256(
  guardiaId + installationId + tipo + timestamp_ISO +
  lat + lng + metodoId + tenantId
)
```

Este hash se calcula en el servidor al momento de insertar y es inmutable. Permite verificar que ningún registro ha sido alterado post-inserción.

---

## I. Plan de implementación (PRs)

### PR-1: Base de datos + Schema ✅ COMPLETADO
- [x] Agregar `marcacionPin` a `OpsGuardia`
- [x] Agregar `marcacionCode` a `CrmInstallation`
- [x] Agregar `fotoEvidenciaUrl` a `OpsMarcacion`
- [x] Crear modelo `OpsMarcacion`
- [x] Migración SQL aplicada
- [x] Actualizar relaciones en modelos existentes

### PR-2: APIs públicas de marcación ✅ COMPLETADO
- [x] `POST /api/public/marcacion/validar`
- [x] `POST /api/public/marcacion/registrar` (con geo obligatorio + foto evidencia)
- [x] `GET /api/public/marcacion/mis-marcaciones`
- [x] Validaciones Zod
- [x] Hash de integridad SHA-256
- [x] Geolocalización obligatoria y bloqueante
- [x] Integración con `OpsAsistenciaDiaria`
- [x] Envío de comprobante por email automático

### PR-3: APIs admin ✅ COMPLETADO
- [x] `POST /api/ops/marcacion/pin` (asignar/resetear PIN)
- [x] `POST /api/ops/marcacion/generar-codigo`
- [x] `GET /api/ops/marcacion/reporte` (con filtros, paginación, stats)

### PR-4: Página pública /marcar/[code] ✅ COMPLETADO
- [x] Layout mobile-first sin auth
- [x] Pantalla de identificación (RUT + PIN)
- [x] Pantalla de marcación (entrada/salida) con GPS obligatorio
- [x] Captura de foto de evidencia (cámara frontal)
- [x] Pantalla de confirmación con hash y geo
- [x] Pantalla de historial (últimos 30 días)
- [x] Geolocation API + detección de contexto seguro (HTTPS)
- [x] Middleware update (ruta pública)

### PR-5: Admin UI ✅ COMPLETADO
- [x] Sección "Marcación" en ficha del guardia (PIN)
- [x] Sección "Marcación digital" en ficha de instalación (QR)
- [x] Generación de QR (vía API qrserver.com)
- [x] Página `/ops/marcaciones` con tabla detallada y filtros
- [x] Navegación: OpsSubnav + BottomNav móvil

### PR-6: Pendientes para certificación
- [ ] Portal de fiscalización DT (acceso con credenciales especiales)
- [ ] Alertas automáticas de jornada excedida
- [ ] Comprobante semanal consolidado por email
- [ ] Firma electrónica avanzada en reportes
- [ ] Procedimiento auditable de corrección de marcaciones
- [ ] Rate limiting por IP en APIs públicas

---

## J. Auditoría de cumplimiento — Resolución Exenta N°38

### Requisitos cumplidos

| # | Requisito Res. Exenta N°38 | Estado | Implementación en OPAI |
|---|---|---|---|
| 1 | Al menos 2 métodos de identificación, uno no biométrico | ✅ | RUT+PIN (conocimiento) + Geolocalización (ubicación). Ninguno biométrico. |
| 2 | Checksum/Hash por marcación | ✅ | SHA-256 calculado en servidor sobre guardiaId+installationId+tipo+timestamp+lat+lng+metodoId+tenantId |
| 3 | Sello de tiempo electrónico | ✅ | Timestamp del servidor (UTC), no del cliente. Campo `timestamp` en OpsMarcacion. |
| 4 | Transmisión en línea a BD central | ✅ | HTTPS → PostgreSQL (Neon) en tiempo real, cada marcación se guarda inmediatamente. |
| 5 | Seguridad anti-adulteración | ✅ | Hash inmutable, registros sin UPDATE/DELETE, logs de auditoría. |
| 6 | Acceso del trabajador a sus datos | ✅ | Endpoint `/api/public/marcacion/mis-marcaciones` + comprobante por email automático. |
| 7 | Protección de datos personales (Ley 19.628) | ✅ | PIN hasheado (bcrypt), sin datos biométricos, HTTPS obligatorio. |
| 8 | Geolocalización | ✅ | GPS obligatorio, validación de radio, bloqueante si fuera de rango. |
| 9 | Comprobante al trabajador | ✅ | Email automático con detalle completo tras cada marcación. |
| 10 | Registro de jornada (entrada/salida) | ✅ | Tipos "entrada" y "salida", integración con OpsAsistenciaDiaria. |
| 11 | Alertas de jornada excedida | ⚠️ Parcial | Se detecta horario del puesto vs hora de marcación. Falta alerta automática cuando se excede el límite legal. |
| 12 | Portal de fiscalización DT | ❌ Pendiente | Acceso web para fiscalizador con credenciales especiales. Se implementará en la fase de pre-certificación. |
| 13 | Firma electrónica avanzada en reportes | ❌ Pendiente | Los reportes exportables necesitarán FEA para cumplimiento total. Se implementará en certificación. |

### Requisitos pendientes para certificación

1. **Portal de fiscalización DT** — Página web con credenciales especiales para que el fiscalizador consulte marcaciones por RUT/período sin intervención del empleador.
2. **Alertas automáticas de jornada** — Notificación cuando un guardia excede el límite legal de horas trabajadas en la semana.
3. **Firma electrónica avanzada** — En reportes oficiales de asistencia (no en cada marcación individual).
4. **Comprobante semanal** — Resumen semanal de todas las marcaciones enviado al trabajador (complementa el comprobante individual por marcación).
5. **Procedimiento de corrección de marcaciones** — Flujo auditable para corregir marcaciones con motivo, aprobación y registro.

### Recomendación

El sistema cumple con los requisitos técnicos fundamentales (hash, sello de tiempo, geolocalización, acceso del trabajador, transmisión en línea). Los puntos pendientes son principalmente de presentación y gestión (portal DT, alertas, reportes firmados) y se abordan típicamente durante el proceso de pre-certificación con el certificador independiente.

---

## K. Criterios de aceptación

1. ✅ Un guardia puede marcar entrada/salida desde un link web en celular
2. ✅ La marcación requiere RUT + PIN (dos factores no biométricos)
3. ✅ Se captura geolocalización y se valida contra el radio de la instalación
4. ✅ Cada marcación genera un hash SHA-256 de integridad inmutable
5. ✅ La marcación actualiza automáticamente `OpsAsistenciaDiaria.checkInAt/checkOutAt`
6. ✅ El admin puede asignar/resetear PINs de guardias
7. ✅ El admin puede generar QR por instalación con link de marcación
8. ✅ El guardia puede ver su historial de marcaciones
9. ✅ La página de marcación funciona en cualquier celular con navegador
10. ✅ No se requiere instalación de app nativa

---

*Documento creado como parte de la implementación del módulo de marcación digital en OPAI Suite. Implementación completada el 2026-02-13. Pendientes de certificación DT documentados en sección PR-6.*
