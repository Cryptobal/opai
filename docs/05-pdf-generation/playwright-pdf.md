# Generación de PDF con Playwright

**Resumen:** Sistema de generación de PDFs de alta fidelidad usando Playwright para exportar presentaciones con diseño idéntico al web.

**Estado:** Vigente - Implementado y operativo

**Scope:** OPAI Docs - Features

---

## 📄 Overview

El sistema usa **Playwright** para generar PDFs de propuestas económicas que son **idénticos** al diseño HTML/CSS del template.

### ¿Por qué Playwright en lugar de react-pdf?

| Característica | @react-pdf/renderer | Playwright |
|---------------|---------------------|------------|
| **Precisión visual** | ⚠️ Aproximada (limitaciones CSS) | ✅ Exacta (renderiza HTML real) |
| **Colores** | ⚠️ Pueden variar | ✅ Idénticos al template |
| **Layouts** | ⚠️ Complejos de replicar | ✅ Automático desde CSS |
| **Gradientes** | ❌ Limitado | ✅ Full support |
| **Tamaño archivo** | ✅ Liviano | ⚠️ Más pesado |

## 🚀 Implementación

### 1. Endpoint API

**Ruta:** `/api/pdf/generate-pricing-v2`

```typescript
POST /api/pdf/generate-pricing-v2
Content-Type: application/json

{
  "clientName": "Las Lengas",
  "quoteNumber": "615378600024513038",
  "quoteDate": "28 de enero de 2026",
  "pricing": {
    "items": [...],
    "subtotal": 73,
    "currency": "CLF"
  },
  "contactEmail": "carlos.irigoyen@gard.cl",
  "contactPhone": "+56 98 230 7771"
}
```

**Response:** PDF binario (application/pdf)

### 2. Componente de descarga

```tsx
import { DownloadPricingButtonV3 } from '@/components/presentation/DownloadPricingButtonV3';

<DownloadPricingButtonV3
  clientName="Cliente"
  quoteNumber="COT-001"
  quoteDate="2026-02-06"
  pricing={pricingData}
  contactEmail="email@gard.cl"
  contactPhone="+56 98 230 7771"
/>
```

### 3. Template HTML

El PDF se genera desde un template HTML completo con:
- ✅ Header teal (#5dc1b9) con logo blanco
- ✅ Tabla responsive con estilos exactos
- ✅ Total neto destacado con border y fondo
- ✅ Footer con contacto
- ✅ Condiciones comerciales
- ✅ Paginación (si hay muchos items)

## 🔧 Instalación

### Local

```bash
# Instalar dependencias (incluye playwright)
npm install

# Instalar navegador Chromium (253MB)
npx playwright install chromium
```

### Vercel (Producción)

Playwright funciona automáticamente en Vercel con la configuración incluida:

```typescript
// playwright.config.ts ya configurado
export const maxDuration = 60; // Pro plan
```

**⚠️ Nota:** El primer despliegue puede tardar más mientras Vercel instala Chromium.

## 🎨 Personalización del diseño

Para modificar el diseño del PDF, edita el template HTML en:

```
src/app/api/pdf/generate-pricing-v2/route.ts
```

### Colores principales

```css
--header-bg: #5dc1b9;       /* Teal header */
--total-border: #5dc1b9;     /* Border del total */
--total-bg: #d1fae5;         /* Fondo del total */
--table-header: #f1f5f9;     /* Fondo header tabla */
```

### Logo

El logo se embebe como base64 SVG:

```typescript
const LOGO_SVG_BASE64 = `data:image/svg+xml;base64,...`;
```

Para cambiar el logo, modifica el SVG en la constante `LOGO_SVG_BASE64`.

## 🐛 Troubleshooting

### Error: "Executable doesn't exist"

```bash
# Reinstalar Chromium
npx playwright install chromium
```

### Error: "Timeout waiting for page"

Aumentar el timeout en la configuración:

```typescript
await page.setContent(html, { 
  waitUntil: 'networkidle',
  timeout: 30000 // 30 segundos
});
```

### PDF se ve diferente en local vs producción

Verificar que:
1. ✅ Chromium está instalado en ambos ambientes
2. ✅ Las fuentes son web-safe (Arial, Helvetica, sans-serif)
3. ✅ No hay referencias a archivos locales (usar base64)

## 📊 Performance

| Métrica | Valor |
|---------|-------|
| **Tiempo de generación** | ~2-4 segundos |
| **Tamaño PDF** | ~50-150 KB (depende de items) |
| **Chromium size** | 253 MB (solo instalación) |
| **Memoria uso** | ~100-200 MB por request |

## 🔄 Migración desde @react-pdf

Si tienes código usando el componente antiguo:

```diff
- import { DownloadPricingButton } from '../DownloadPricingButton';
+ import { DownloadPricingButtonV3 } from '../DownloadPricingButtonV3';

- <DownloadPricingButton {...props} />
+ <DownloadPricingButtonV3 {...props} />
```

## 📝 Changelog

### V3 (Playwright) - 2026-02-06
- ✅ PDFs idénticos al template HTML
- ✅ Colores exactos (#5dc1b9)
- ✅ Logo correctamente alineado
- ✅ Soporte para gradientes y efectos CSS
- ✅ Footer con posición fija

### V2 (@react-pdf) - DEPRECATED
- ⚠️ Colores aproximados
- ⚠️ Layouts desalineados
- ⚠️ Sin soporte para gradientes complejos

### V1 (jsPDF) - DEPRECATED
- ❌ Diseño muy básico
- ❌ Sin branding
