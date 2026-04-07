# Portal Rondas — Rediseño "Mission Control"

**Fecha:** 2026-03-04
**Enfoque:** Rediseño completo UX/UI del portal de rondas para guardias

---

## Stack Técnico

| Componente | Tecnología | Notas |
|---|---|---|
| Mapa | Leaflet + OpenStreetMap | Gratis, sin API key, ~40KB |
| QR Scanner | `html5-qrcode` | Cross-browser (iOS Safari + Chrome Android + Desktop), ~45KB |
| GPS live | `navigator.geolocation.watchPosition` | Tracking continuo durante ronda activa |
| Offline | IndexedDB (existente) | Se extiende para incidentes |
| Theme | Dark (#0a0a0f) | Mantiene base actual |

---

## Pantallas

### 1. Login

- PIN visual tipo dots (como desbloqueo de teléfono), 4-6 dígitos
- Sin selector de instalación — se asigna automáticamente (1 guardia = 1 instalación)
- Si no tiene instalación asignada, error claro
- RUT + PIN → autenticar → directo a "Mis Rondas"
- Animación sutil en el logo/escudo al cargar

### 2. Mis Rondas (Dashboard)

Rondas agrupadas por estado, en este orden:

1. **En Curso** — card destacada con barra de progreso `X/Y checkpoints · N%`, timer corriendo, botón "Continuar"
2. **Atrasadas** — badge rojo, muestra "hace Xh Ym"
3. **Próximas** — countdown "en Xh Ym", sin botón de iniciar hasta ventana de tolerancia (`toleranciaMinutos`)
4. **Completadas** — colapsadas, muestran score y porcentaje

Cada card muestra:
- Nombre de la ronda
- Hora programada
- Cantidad de checkpoints (`X/Y` con progreso o `Y puntos` si no iniciada)
- Barra de progreso visual (en curso / completadas)
- Mini-mapa estático con pines de checkpoints
- Duración estimada

Elementos adicionales:
- Header: nombre del guardia, instalación, indicador online/offline, botón salir
- Fecha del día visible
- Botón "Reportar Incidente" siempre accesible
- Pull-to-refresh / botón actualizar

### 3. Ronda Activa (Mission Control)

Pantalla core dividida en dos zonas:

**Header fijo:**
- Botón volver, nombre de la ronda, refresh
- Timer corriendo en tiempo real, progreso `X/Y`, barra de progreso

**Mapa (50% superior):**
- Leaflet con tiles OpenStreetMap
- Posición del guardia: punto azul pulsante (`watchPosition`)
- Checkpoints como pines coloreados: ✅ verde (completado), 🔵 teal (siguiente), ⚪ gris (pendiente)
- Línea punteada conectando checkpoints en orden de la ronda
- Botón "Centrar" para re-enfocar en posición del guardia
- Mapa colapsable (swipe down) para ver más lista

**Lista de checkpoints (50% inferior, scrollable):**
- Checkpoint activo: card destacada con distancia en metros (actualización en tiempo real), indicador obligatorio/opcional, indicador QR requerido
- Checkpoints pendientes: lista compacta
- Checkpoints completados: al fondo, con hora de marcación, colapsados

**Botones fijos al fondo:**
- "Reportar Incidente" — siempre visible
- "Completar Ronda" — con confirmación modal si hay checkpoints sin marcar: "Te faltan N puntos (nombres). ¿Completar de todas formas?"

### 4. Marcar Checkpoint (Bottom Sheet)

Bottom sheet que sube sobre el mapa (no pantalla aparte). El mapa sigue visible arriba con el pin del checkpoint parpadeando.

**Contenido del bottom sheet:**
- Nombre del checkpoint
- GPS: estado (obteniendo/listo/error) + distancia al checkpoint en metros
  - Dentro del radio: checkmark verde
  - Fuera del radio: warning amarillo "Estás a Xm (radio: Ym)" — se permite marcar, backend registra anomalía
- QR: estado (pendiente/escaneado) + botón "Escanear QR" (solo si requerido)
- Foto: botón "Agregar Foto" (opcional), preview si capturada
- Observaciones: textarea opcional, 500 chars max
- Botón "Confirmar Marcación" — deshabilitado hasta GPS listo y QR escaneado (si requerido)

**Al confirmar:**
- Sheet se cierra con animación
- Pin en mapa cambia a ✅ verde
- Lista avanza al siguiente checkpoint
- Feedback háptico

**Anti-fraude (silencioso, se mantiene):**
- batteryLevel, motionData, clientHash, gpsAccuracy

### 5. Ronda Completada (Resumen)

- Gauge circular animado de trust score (0-100), color dinámico:
  - Verde ≥80 ("Excelente")
  - Amarillo ≥60 ("Buen trabajo")
  - Rojo <60 ("Puedes mejorar")
- Resumen: % completado, duración, puntos visitados, puntualidad (a tiempo / X min tarde), omitidos
- Detalle por checkpoint: hora de marcación, distancia GPS, verificaciones pasadas (GPS ✓, QR ✓, Foto ✓)
- Puntos omitidos en rojo con ❌
- Botón "Volver a Mis Rondas"

### 6. Reportar Incidente (Modal)

Modal overlay accesible desde dashboard y ronda activa.

- Tipos predefinidos (grid de iconos grandes, touch-friendly):
  - Incendio, Fuga de agua, Acceso forzado, Persona sospechosa, Falla eléctrica, Otro
- Foto: abre PhotoCapture existente, recomendada no obligatoria
- Descripción: textarea requerida
- GPS: captura automática al abrir modal
- Vinculación automática: si hay ronda activa, se asocia a la ejecución y pre-selecciona checkpoint activo (dropdown para cambiar)
- Soporte offline: se guarda en IndexedDB y sincroniza después

### 7. QR Scanner

- Librería `html5-qrcode` — funciona en todos los navegadores (iOS Safari, Chrome Android, Desktop)
- Reemplaza completamente `BarcodeDetector` nativo
- Misma UX en todos los dispositivos: cámara + viewfinder + escaneo automático
- Fallback manual (input de texto para código del QR) solo si la cámara falla o permisos denegados
- Preparado para migración futura a app nativa (se reemplaza por scanner nativo del OS)

---

## Reglas de Negocio

- Instalación automática al login (1 guardia = 1 instalación siempre)
- Rondas próximas sin botón de iniciar hasta ventana de tolerancia (`toleranciaMinutos`)
- Completar ronda requiere confirmación modal si hay checkpoints sin marcar
- Se permite marcar fuera del radio GPS con warning (backend registra anomalía)
- Incidentes se guardan offline si no hay conexión

## Lo Que Se Mantiene

- Sesión de 12h en sessionStorage
- Detección de fraude silenciosa (batería, motion, hash, velocidad)
- Motor de alertas y anomalías del backend
- PWA con service worker
- Chat como FAB
- Soporte offline con IndexedDB y sync
- API routes existentes (se extienden, no se reemplazan)

## Modelo de Datos

No se requieren cambios al schema de Prisma. El modelo `OpsRondaIncidente` ya soporta los campos necesarios para el reporte de incidentes (tipo, descripcion, fotoUrl, lat, lng, checkpointId, ejecucionId, guardiaId, installationId).
