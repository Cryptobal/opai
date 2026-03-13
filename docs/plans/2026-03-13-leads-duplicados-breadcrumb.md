# Plan: Detección duplicados + Breadcrumb en CRM/Ops

**Fecha:** 2026-03-13  
**Contexto:** Usuario en Leeds creando lead "Anglo American" (empresa ya existente). Necesita detección de duplicados y breadcrumb visible.

---

## 1. Detección de empresa duplicada

### Situación actual
- **Cuándo:** Solo al hacer clic en **"Verificar y aprobar"** (no al crear el lead).
- **Cómo:** Match exacto case-insensitive: `name: { equals: accountName, mode: "insensitive" }`.
- **Problema:** "Anglo American" ≠ "AngloAmerican" — no se detecta porque el espacio importa.

### Propuesta
- **A)** En el approve, además de `equals`, buscar cuentas con nombres **similares** usando la lógica de `/api/crm/accounts/duplicates` (normalización, Levenshtein, includes).
- **B)** Opcional: al crear el lead, hacer un check asíncrono y mostrar aviso "¿Ya existe esta empresa?" sin bloquear.

### Implementación recomendada (A)
En `approve/route.ts`, antes de devolver `duplicates`, llamar también a una búsqueda por similitud:
- Normalizar: quitar espacios extra, acentos, puntuación.
- Si `equals` no encuentra nada, buscar con `contains` o usar la API duplicates para nombres similares.
- Unificar resultados: exactos + similares (score ≥ 0.45).

---

## 2. Contactos del lead → prospecto

**Estado:** ✅ Ya funciona. Al aprobar, los datos del lead (firstName, lastName, email, phone) se usan para crear el contacto en la cuenta prospecto.

---

## 3. Breadcrumb siempre visible

### Situación actual
- `EntityDetailLayout`: breadcrumb con `lg:hidden` — solo visible en móvil.
- En desktop se asume que el sidebar da contexto, pero el usuario pierde la ruta.

### Propuesta
- Quitar `lg:hidden` del breadcrumb en `EntityDetailLayout` para que sea visible en todos los breakpoints.
- Revisar páginas que usan `CrmRecordHeader` o `Breadcrumb` standalone para consistencia.

### Archivos afectados
- `src/components/crm/EntityDetailLayout.tsx` — quitar `lg:hidden`.

---

## Orden de implementación
1. Breadcrumb visible (cambio mínimo).
2. Detección de duplicados por similitud en approve.
