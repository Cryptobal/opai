# 📁 Archivos Deprecated

**Resumen:** Carpeta con archivos de documentación deprecated que han sido movidos a ubicaciones actualizadas.

**Estado:** Deprecated - Archivo histórico

**Scope:** OPAI Docs

---

## ⚠️ Archivos Históricos

Esta carpeta contiene archivos stub que estaban en la raíz de `/docs` y han sido **reemplazados por documentación actualizada** en carpetas organizadas.

Estos archivos se mantienen para:
- Compatibilidad con enlaces antiguos
- Referencia histórica
- Evitar romper bookmarks

---

## 📋 Archivos en esta Carpeta

| Archivo Deprecated | Ubicación Actual | Descripción |
|-------------------|------------------|-------------|
| `ZOHO-INTEGRATION.md` | [`03-integrations/zoho-integration.md`](../03-integrations/zoho-integration.md) | Integración con Zoho CRM |
| `TOKENS-ZOHO.md` | [`03-integrations/tokens-zoho.md`](../03-integrations/tokens-zoho.md) | Tokens dinámicos disponibles |
| `PRESENTACION-COMERCIAL-BASE.md` | [`04-sales/presentacion-comercial.md`](../04-sales/presentacion-comercial.md) | Template comercial |
| `ESTADO-PROYECTO.md` | [`02-implementation/estado-proyecto.md`](../02-implementation/estado-proyecto.md) | Estado del proyecto |
| `DOCUMENTO-MAESTRO-APLICACION.md` | [`00-product/001-docs-master.md`](../00-product/001-docs-master.md) | Documento maestro |
| `DATABASE-SCHEMA.md` | [`02-implementation/database-schema.md`](../02-implementation/database-schema.md) | Esquema de base de datos |
| `CHECKLIST-MULTITENANT.md` | [`02-implementation/checklist-multitenant.md`](../02-implementation/checklist-multitenant.md) | Checklist multi-tenant |

---

## 🎯 ¿Por qué esta carpeta?

### Antes
```
docs/
├── ZOHO-INTEGRATION.md
├── TOKENS-ZOHO.md
├── PRESENTACION-COMERCIAL-BASE.md
├── ESTADO-PROYECTO.md
├── ...
├── 00-product/
├── 01-architecture/
└── 02-implementation/
```

**Problemas:**
- Archivos sueltos en raíz sin organización
- Duplicación de información
- Difícil navegación

### Ahora
```
docs/
├── _deprecated/          ← Archivos históricos aquí
├── 00-product/          ← Documentos maestros
├── 01-architecture/     ← Arquitectura técnica
├── 02-implementation/   ← Estado e implementación
├── 03-integrations/     ← Integraciones
└── 04-sales/            ← Ventas
```

**Ventajas:**
- ✅ Raíz limpia y organizada
- ✅ Archivos deprecated agrupados
- ✅ Compatibilidad mantenida
- ✅ Navegación clara

---

## 🔗 Documentación Vigente

Para documentación actualizada, ver:

📄 **[README.md Principal](../README.md)** - Índice completo de documentación

### Por Categoría
- **Producto:** [`00-product/`](../00-product/)
- **Arquitectura:** [`01-architecture/`](../01-architecture/)
- **Implementación:** [`02-implementation/`](../02-implementation/)
- **Integraciones:** [`03-integrations/`](../03-integrations/)
- **Ventas:** [`04-sales/`](../04-sales/)

---

**Última actualización:** 06 de Febrero de 2026  
**Nota:** Estos archivos no se actualizan. Usar ubicaciones vigentes.
