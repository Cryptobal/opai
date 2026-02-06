# 🏷️ Tokens Disponibles - Zoho CRM

**Resumen:** Listado completo de tokens dinámicos disponibles para templates, mapeados desde campos de Zoho CRM.

**Estado:** Vigente - Documentación de referencia

**Scope:** OPAI Docs - Integraciones

---

**Última actualización:** 05 de Febrero de 2026

---

## 📖 Cómo usar este documento

1. Busca el token que necesitas en las tablas de abajo
2. Copia el token (ej: `[QUOTE_NUMBER]`)
3. Pégalo en cualquier sección del template
4. El sistema lo reemplazará automáticamente con el valor real de Zoho

**Ejemplo:**
```
"Propuesta para [ACCOUNT_NAME]"  →  "Propuesta para Polpaico S.A."
```

---

## 📊 QUOTE (Cotización)

| Token | Ejemplo | Descripción | Campo Zoho |
|-------|---------|-------------|------------|
| `[QUOTE_ID]` | "5847392000001234567" | ID interno de Zoho | `quote.id` |
| `[QUOTE_NUMBER]` | "COT-2026-00342" | Número de cotización | `quote.Quote_Number` |
| `[QUOTE_SUBJECT]` | "Servicio de Seguridad 24/7" | Asunto/Título | `quote.Subject` |
| `[QUOTE_DESCRIPTION]` | "Servicio de guardias..." | Descripción detallada | `quote.Descripcion_AI` |
| `[QUOTE_SUBTOTAL]` | "$5.300.000" | Subtotal sin IVA | `quote.Sub_Total` |
| `[QUOTE_TAX]` | "$1.007.000" | IVA (19%) | `quote.Tax` |
| `[QUOTE_TOTAL]` | "$6.307.000" | Total con IVA | `quote.Grand_Total` |
| `[QUOTE_CURRENCY]` | "CLP" | Moneda | `quote.Currency` |
| `[QUOTE_VALID_UNTIL]` | "4 de marzo de 2026" | Validez de la cotización | `quote.Valid_Till` |
| `[QUOTE_CREATED_DATE]` | "4 de febrero de 2026" | Fecha de creación | `quote.Created_Time` |
| `[QUOTE_STAGE]` | "Propuesta enviada" | Estado de la cotización | `quote.Quote_Stage` |

---

## 🏢 ACCOUNT (Cuenta/Empresa)

| Token | Ejemplo | Descripción | Campo Zoho |
|-------|---------|-------------|------------|
| `[ACCOUNT_ID]` | "5847392000001234567" | ID interno de Zoho | `account.id` |
| `[ACCOUNT_NAME]` | "Polpaico S.A." | Nombre de la empresa | `account.Account_Name` |
| `[ACCOUNT_PHONE]` | "+56 2 2123 4567" | Teléfono principal | `account.Phone` |
| `[ACCOUNT_WEBSITE]` | "https://polpaico.cl" | Sitio web | `account.Website` |
| `[ACCOUNT_INDUSTRY]` | "Manufactura" | Industria/Sector | `account.Industry` |
| `[ACCOUNT_RUT]` | "96.810.370-9" | RUT de la empresa | `account.RUT__c` |
| `[ACCOUNT_GIRO]` | "Fabricación de cemento" | Giro comercial | `account.Giro__c` |
| `[ACCOUNT_ADDRESS]` | "Av. Américo Vespucio 1501" | Dirección completa | `account.Billing_Street` |
| `[ACCOUNT_CITY]` | "Pudahuel" | Ciudad | `account.Billing_City` |
| `[ACCOUNT_STATE]` | "Región Metropolitana" | Región/Estado | `account.Billing_State` |
| `[ACCOUNT_ZIP]` | "9020000" | Código postal | `account.Billing_Code` |
| `[ACCOUNT_COUNTRY]` | "Chile" | País | `account.Billing_Country` |

---

## 👤 CONTACT (Contacto)

| Token | Ejemplo | Descripción | Campo Zoho |
|-------|---------|-------------|------------|
| `[CONTACT_ID]` | "5847392000001234567" | ID interno de Zoho | `contact.id` |
| `[CONTACT_NAME]` | "Roberto González Martínez" | Nombre completo | `contact.Full_Name` |
| `[CONTACT_FIRST_NAME]` | "Roberto" | Nombre | `contact.First_Name` |
| `[CONTACT_LAST_NAME]` | "González Martínez" | Apellido(s) | `contact.Last_Name` |
| `[CONTACT_TITLE]` | "Gerente de Operaciones" | Cargo | `contact.Title` |
| `[CONTACT_DEPARTMENT]` | "Operaciones" | Departamento | `contact.Department` |
| `[CONTACT_EMAIL]` | "rgonzalez@polpaico.cl" | Email | `contact.Email` |
| `[CONTACT_PHONE]` | "+56 2 2123 4567" | Teléfono oficina | `contact.Phone` |
| `[CONTACT_MOBILE]` | "+56 9 8765 4321" | Celular | `contact.Mobile` |

---

## 💼 DEAL (Negocio/Oportunidad)

| Token | Ejemplo | Descripción | Campo Zoho |
|-------|---------|-------------|------------|
| `[DEAL_ID]` | "5847392000001234567" | ID interno de Zoho | `deal.id` |
| `[DEAL_NAME]` | "Polpaico - Servicio Seguridad" | Nombre del negocio | `deal.Deal_Name` |
| `[DEAL_STAGE]` | "Propuesta enviada" | Etapa del negocio | `deal.Stage` |
| `[DEAL_AMOUNT]` | "$6.307.000" | Monto del negocio | `deal.Amount` |
| `[DEAL_PROBABILITY]` | "60%" | Probabilidad de cierre | `deal.Probability` |
| `[DEAL_CLOSING_DATE]` | "15 de marzo de 2026" | Fecha estimada de cierre | `deal.Closing_Date` |
| `[DEAL_TYPE]` | "Nuevo Negocio" | Tipo de negocio | `deal.Type` |
| `[DEAL_DESCRIPTION]` | "Implementación servicio..." | Descripción | `deal.Description` |
| `[DEAL_LOCATION]` | "Av. Vespucio 1501, Pudahuel" | Ubicación (Google Maps) | `deal.Direcci_n_Google_Maps` |

---

## ⚙️ SYSTEM (Sistema)

| Token | Ejemplo | Descripción | Origen |
|-------|---------|-------------|--------|
| `[CURRENT_DATE]` | "5 de febrero de 2026" | Fecha actual (español) | Sistema |
| `[CURRENT_YEAR]` | "2026" | Año actual | Sistema |
| `[PRESENTATION_ID]` | "gard_pres_abc123xyz" | ID único de la presentación | Sistema |
| `[PRESENTATION_URL]` | "https://docs.gard.cl/p/abc123" | URL pública | Sistema |

---

## 📋 PRICING (Items de Cotización)

**Nota:** Estos tokens se usan dentro de tablas de pricing (S23)

### Items individuales (hasta 10 items):

| Token | Ejemplo | Descripción |
|-------|---------|-------------|
| `[ITEM_1_DESCRIPTION]` | "Guardias 24/7 (turnos 6x1)" | Descripción item 1 |
| `[ITEM_1_QUANTITY]` | "4" | Cantidad item 1 |
| `[ITEM_1_UNIT_PRICE]` | "$950.000" | Precio unitario item 1 |
| `[ITEM_1_SUBTOTAL]` | "$3.800.000" | Subtotal item 1 |
| `[ITEM_2_DESCRIPTION]` | "Supervisor de seguridad" | Descripción item 2 |
| `[ITEM_2_QUANTITY]` | "1" | Cantidad item 2 |
| `[ITEM_2_UNIT_PRICE]` | "$1.200.000" | Precio unitario item 2 |
| `[ITEM_2_SUBTOTAL]` | "$1.200.000" | Subtotal item 2 |
| ... | ... | ... |
| `[ITEM_10_DESCRIPTION]` | ... | Descripción item 10 |
| `[ITEM_10_QUANTITY]` | ... | Cantidad item 10 |
| `[ITEM_10_UNIT_PRICE]` | ... | Precio unitario item 10 |
| `[ITEM_10_SUBTOTAL]` | ... | Subtotal item 10 |

**Uso típico en S23:**
```typescript
items: [
  {
    quantity: [ITEM_1_QUANTITY],
    description: '[ITEM_1_DESCRIPTION]',
    unitPrice: [ITEM_1_UNIT_PRICE],
    subtotal: [ITEM_1_SUBTOTAL]
  },
  {
    quantity: [ITEM_2_QUANTITY],
    description: '[ITEM_2_DESCRIPTION]',
    unitPrice: [ITEM_2_UNIT_PRICE],
    subtotal: [ITEM_2_SUBTOTAL]
  }
]
```

---

## 💳 PAYMENT (Condiciones Comerciales)

| Token | Ejemplo | Descripción |
|-------|---------|-------------|
| `[PAYMENT_TERMS]` | "Mensual" | Forma de pago |
| `[BILLING_FREQ]` | "Fin de mes" | Frecuencia facturación |
| `[BILLING_DAY]` | "Último día hábil" | Día de facturación |
| `[ADJUSTMENT]` | "70% IPC / 30% IMO" | Fórmula de reajuste |
| `[CONTRACT_DURATION]` | "12 meses" | Duración del contrato |

---

## 📍 SERVICE (Servicio/Alcance)

| Token | Ejemplo | Descripción |
|-------|---------|-------------|
| `[SERVICE_SCOPE]` | "Servicio de guardias 24/7..." | Resumen del alcance |
| `[SERVICE_TYPE]` | "Seguridad Privada" | Tipo de servicio |
| `[SERVICE_LOCATION]` | "Planta Polpaico, Pudahuel" | Ubicación del servicio |
| `[SERVICE_START_DATE]` | "1 de marzo de 2026" | Fecha de inicio |
| `[STAFF_COUNT]` | "5" | Total de personal (guardias + supervisores) |
| `[GUARDS_COUNT]` | "4" | Cantidad de guardias |
| `[SUPERVISORS_COUNT]` | "1" | Cantidad de supervisores |

---

## 🔍 EJEMPLOS DE USO

### Ejemplo 1: Hero (S01)
```typescript
title: 'Propuesta Comercial para [ACCOUNT_NAME]',
subtitle: 'Preparado para [CONTACT_NAME]',
metadata: 'Cotización [QUOTE_NUMBER] · [CURRENT_DATE]'
```

**Resultado:**
```
Propuesta Comercial para Polpaico S.A.
Preparado para Roberto González Martínez
Cotización COT-2026-00342 · 5 de febrero de 2026
```

---

### Ejemplo 2: Executive Summary (S02)
```typescript
client: {
  name: '[ACCOUNT_NAME]',
  industry: '[ACCOUNT_INDUSTRY]',
  location: '[ACCOUNT_CITY], [ACCOUNT_STATE]'
}
```

**Resultado:**
```
Polpaico S.A.
Manufactura
Pudahuel, Región Metropolitana
```

---

### Ejemplo 3: Propuesta Económica (S23)
```typescript
pricing: {
  subtotal: '[QUOTE_SUBTOTAL]',
  tax: '[QUOTE_TAX]',
  total: '[QUOTE_TOTAL]',
  currency: '[QUOTE_CURRENCY]',
  validUntil: '[QUOTE_VALID_UNTIL]',
  paymentTerms: '[PAYMENT_TERMS]',
  billingFrequency: '[BILLING_FREQ]'
}
```

**Resultado:**
```
Subtotal: $5.300.000
IVA (19%): $1.007.000
Total: $6.307.000
Moneda: CLP
Válida hasta: 4 de marzo de 2026
Forma de pago: Mensual
Facturación: Fin de mes
```

---

## ⚠️ NOTAS IMPORTANTES

### Formato automático
El sistema formatea automáticamente:
- **Montos**: `1007000` → `"$1.007.000"`
- **Fechas**: `"2026-02-04"` → `"4 de febrero de 2026"`
- **RUT**: `"96810370-9"` → `"96.810.370-9"`

### Tokens opcionales
Si un campo no existe en Zoho, el token se reemplaza por string vacío:
- `[CONTACT_MOBILE]` → `""` (si no hay celular)

### Case sensitive
Los tokens distinguen mayúsculas:
- ✅ `[ACCOUNT_NAME]`
- ❌ `[account_name]`
- ❌ `[Account_Name]`

---

## 🔄 ACTUALIZACIÓN DE TOKENS

### Si necesitas agregar un nuevo token:

1. **Actualizar `lib/tokens.ts`:**
   ```typescript
   '[NUEVO_TOKEN]': data.quote?.Nuevo_Campo
   ```

2. **Actualizar este documento** (TOKENS-ZOHO.md)

3. **Actualizar `types/presentation.ts`** si es un campo nuevo del payload

4. **Probar en preview** con `?admin=true&tokens=true`

---

## 📚 DOCUMENTOS RELACIONADOS

- **ESTADO-PROYECTO.md** - Estado actual del sistema
- **DOCUMENTO-MAESTRO-APLICACION.md** - Arquitectura completa
- **PRESENTACION-COMERCIAL-BASE.md** - Estructura de secciones
- **lib/tokens.ts** - Implementación del sistema de tokens

---

**Última actualización:** 05 de Febrero de 2026  
**Total de tokens:** 85+ tokens disponibles
