# 🗺️ Rutas de Gard Docs

## Descripción de Rutas

### 🔧 **MODO ADMIN/PREVIEW**

#### `/templates/commercial/preview?admin=true`
**Para:** Administradores y editores de templates

**Características:**
- ✅ **Sidebar de navegación lateral** (acordeón por grupos)
- ✅ **Toggle tokens:** Ver `[ACCOUNT_NAME]` o datos de ejemplo
- ✅ **Selector de theme:** Cambiar entre executive/ops/trust
- ✅ **Scroll-spy:** Resalta sección activa automáticamente
- ✅ **Botón flotante:** Abrir/cerrar sidebar
- ✅ **Indicador "PREVIEW MODE":** Badge amarillo superior derecho
- ✅ **Copiar link:** Compartir URL de preview
- ✅ **Ver como cliente:** Link a vista pública

**Keyboard shortcuts:**
- `P` - Toggle preview navigator (próximamente)
- `T` - Toggle tokens (próximamente)

**Query params:**
- `?admin=true` - Requerido para acceder
- `&theme=executive` - Theme inicial (executive/ops/trust)
- `&tokens=true` - Mostrar tokens sin reemplazar

**Ejemplo:**
```
http://localhost:3000/templates/commercial/preview?admin=true
http://localhost:3000/templates/commercial/preview?admin=true&theme=ops
http://localhost:3000/templates/commercial/preview?admin=true&tokens=true
```

---

### 👥 **MODO CLIENTE (Público)**

#### `/p/[uniqueId]`
**Para:** Clientes que reciben la propuesta

**Características:**
- ✅ **Sin elementos de admin:** Vista limpia
- ✅ **Tokens reemplazados:** Datos reales del cliente
- ✅ **Progress bar superior:** Indica avance
- ✅ **Navigation dots:** (solo desktop >1280px)
- ✅ **Header con CTAs:** WhatsApp + Agendar
- ✅ **Footer completo:** Contacto y redes sociales
- ✅ **Videos YouTube:** 3 videos demostrativos
- ✅ **Responsive 100%:** Mobile-first

**Ejemplo:**
```
http://localhost:3000/p/demo-polpaico-2026-02
http://localhost:3000/p/cualquier-id-aqui
```

---

## 📊 Comparación

| Feature | Template Preview | Presentación Cliente |
|---------|------------------|---------------------|
| **URL** | `/templates/commercial/preview?admin=true` | `/p/[uniqueId]` |
| **Sidebar** | ✅ Visible | ❌ Oculto |
| **Tokens** | Toggle on/off | Siempre reemplazados |
| **Theme selector** | ✅ Sí | ❌ No (fijo) |
| **Botón flotante** | ✅ Sí | ❌ No |
| **Progress bar** | ✅ Sí | ✅ Sí |
| **Navigation dots** | ✅ Sí | ✅ Sí (desktop) |
| **Acceso** | Requiere `?admin=true` | Público |

---

## 🎨 Sidebar Structure

```
Preview Navigator
├─ INICIO (1)
│  └─ S01 Hero
│
├─ PROPUESTA DE VALOR (3)
│  ├─ S02 Executive Summary
│  ├─ S03 Transparencia
│  └─ S04 El Riesgo Real
│
├─ PROBLEMA (2)
│  ├─ S05 Fallas del Modelo
│  └─ S06 Costo Real
│
├─ SOLUCIÓN (3)
│  ├─ S07 Sistema de Capas
│  ├─ S08 4 Pilares
│  └─ S09 Cómo Operamos
│
├─ OPERACIÓN (3)
│  ├─ S10 Supervisión
│  ├─ S11 Reportabilidad
│  └─ S12 Cumplimiento
│
├─ CREDENCIALES (4)
│  ├─ S13 Certificaciones
│  ├─ S14 Tecnología
│  ├─ S15 Selección
│  └─ S16 Nuestra Gente
│
├─ GARANTÍAS (2)
│  ├─ S17 Continuidad
│  └─ S18 KPIs
│
├─ PRUEBA SOCIAL (3)
│  ├─ S19 Resultados
│  ├─ S20 Clientes
│  └─ S21 Sectores
│
├─ COMERCIAL (4)
│  ├─ S22 TCO
│  ├─ S23 Pricing
│  ├─ S24 Términos
│  └─ S25 Comparación
│
└─ CIERRE (3)
   ├─ S26 Por Qué Eligen
   ├─ S27 Implementación
   └─ S28 CTA Final
```

---

## 🚀 Uso Recomendado

### **Para revisar/editar template:**
```bash
# 1. Abrir en modo preview
http://localhost:3000/templates/commercial/preview?admin=true

# 2. Usar sidebar para navegar entre secciones
# 3. Toggle "Mostrar tokens" para ver placeholders
# 4. Cambiar theme para ver variantes
# 5. Click "Ver como cliente" para vista final
```

### **Para mostrar a cliente:**
```bash
# Usar siempre la ruta /p/[uniqueId]
http://localhost:3000/p/demo-polpaico-2026-02
```

---

## 🔐 Seguridad (Futuro)

**Actualmente:**
- `/templates/*` requiere `?admin=true` (básico)

**Próximamente:**
- NextAuth.js para login real
- Middleware protegiendo `/templates/*`
- Roles (admin, editor, viewer)

---

**Última actualización:** 05 de Febrero de 2026
