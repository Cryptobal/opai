# Test E2E - Notas de Investigación del Sistema de Rondas OPAI

## Estructura de Archivos del Módulo de Rondas

### Base de Datos (Prisma Schema)
- **Archivo**: `prisma/schema.prisma`
- **Schema DB**: `ops` (operaciones), `crm` (instalaciones)

### Modelos Principales
| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| OpsCheckpoint | ops.checkpoints | Puntos de marcación con QR y geolocalización |
| OpsRondaTemplate | ops.ronda_templates | Plantillas de ronda con secuencia de checkpoints |
| OpsRondaCheckpoint | ops.ronda_checkpoints | Relación template↔checkpoint con orden |
| OpsRondaProgramacion | ops.ronda_programaciones | Programación recurrente de rondas |
| OpsRondaEjecucion | ops.ronda_ejecuciones | Instancia de ejecución de una ronda |
| OpsMarcacionCheckpoint | ops.marcacion_checkpoints | Registro de marcación en checkpoint |
| OpsAlertaRonda | ops.alertas_ronda | Alertas generadas por anomalías |
| OpsRondaIncidente | ops.ronda_incidentes | Incidentes reportados durante ronda |
| OpsGuardia | ops.guardias | Perfil del guardia |
| OpsPersona | ops.personas | Datos personales (RUT, nombre) |
| CrmInstallation | crm.installations | Instalaciones/sitios |

### Endpoints API

#### APIs Públicas (sin auth, usadas por el guardia en campo)
- `POST /api/public/ronda/autenticar` - Autenticación con code+RUT+PIN
- `GET /api/public/ronda/pendientes` - Rondas pendientes del guardia
- `POST /api/public/ronda/iniciar` - Iniciar ejecución de ronda
- `POST /api/public/ronda/marcar` - Marcar checkpoint (core del flujo)
- `POST /api/public/ronda/completar` - Completar ronda
- `POST /api/public/ronda/incidente` - Reportar incidente
- `POST /api/public/ronda/panico` - Botón de pánico
- `POST /api/public/ronda/sync` - Sincronización offline

#### APIs Ops (requieren auth de admin)
- `GET/POST /api/ops/rondas/checkpoints` - CRUD checkpoints
- `GET/POST /api/ops/rondas/templates` - CRUD templates
- `GET/POST /api/ops/rondas/programacion` - CRUD programación
- `GET /api/ops/rondas/ejecuciones` - Listar ejecuciones
- `GET /api/ops/rondas/monitoreo` - Monitoreo en tiempo real

#### APIs Portal (auth de guardia)
- `POST /api/portal/rondas/marcar` - Marcar checkpoint (autenticado)
- `POST /api/portal/rondas/completar` - Completar ronda
- `GET /api/portal/rondas/mis-rondas` - Rondas del guardia

### Servicios Backend
- `src/lib/rondas/trust-score-v2.ts` - Cálculo de trust score (0-100)
- `src/lib/rondas/anomaly-detection.ts` - Detección de anomalías
- `src/lib/rondas/alert-engine.ts` - Motor de alertas post-marcación
- `src/lib/rondas/geo-utils.ts` - Validación geográfica (geofencing)
- `src/lib/marcacion.ts` - Hash de integridad SHA-256

### Validaciones (Zod)
- `src/lib/validations/rondas.ts` - Schemas para todos los endpoints

### Flujo de Datos
1. Admin crea checkpoints → `OpsCheckpoint`
2. Admin crea template con checkpoints → `OpsRondaTemplate` + `OpsRondaCheckpoint`
3. Admin programa ronda → `OpsRondaProgramacion` → genera `OpsRondaEjecucion`
4. Guardia se autentica → code + RUT + PIN (bcrypt)
5. Guardia inicia ronda → status "pendiente" → "en_curso"
6. Guardia marca cada checkpoint → `OpsMarcacionCheckpoint` con geo, anomalías, trust
7. Guardia completa ronda → status "completada" o "incompleta" (>20% omitido)

## Datos del Test E2E

### Instalación
- **Nombre**: Gard - Oficina Central
- **ID**: 00000000-0000-0000-0000-000000000010
- **Código**: GARD-CENTRAL-001
- **Ubicación**: Av. Providencia 1234, Providencia, Santiago

### Guardia
- **Nombre**: Juan Pérez
- **RUT**: 13255838-8
- **PIN**: 1234
- **ID Guardia**: 00000000-0000-0000-0000-000000001000

### Checkpoints Creados
| # | Nombre | QR Code | Latitud | Longitud | Radio |
|---|--------|---------|---------|----------|-------|
| 1 | Acceso Principal | GARD-CP-001 | -33.4372 | -70.6506 | 50m |
| 2 | Bodega Norte | GARD-CP-002 | -33.4375 | -70.6510 | 50m |
| 3 | Estacionamiento | GARD-CP-003 | -33.4370 | -70.6515 | 50m |
| 4 | Perímetro Sur | GARD-CP-004 | -33.4368 | -70.6508 | 50m |
| 5 | Sala de Control | GARD-CP-005 | -33.4373 | -70.6502 | 50m |

### Resultado
- **Estado**: ÉXITO TOTAL (41/42 pasos exitosos)
- **Único hallazgo**: Duración muestra 0 min cuando la ronda se completa en <60 seg (comportamiento esperado)
- **Trust Score Final**: 90%
- **5/5 checkpoints** marcados exitosamente vía API pública
