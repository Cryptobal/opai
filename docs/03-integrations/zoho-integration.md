# 🔗 Integración con Zoho CRM

**Resumen:** Integración completa con Zoho CRM vía webhooks para automatizar la creación de presentaciones desde cotizaciones.

**Estado:** Vigente - Implementado y operativo

**Scope:** OPAI Docs - Integraciones

---

**Última actualización:** 05 de Febrero de 2026  

---

## 🎯 OBJETIVO

Crear presentaciones automáticamente desde Zoho CRM mediante un botón personalizado que envía datos a Gard Docs vía webhook.

---

## 🔄 FLUJO COMPLETO

```
Usuario en Zoho CRM
    ↓
Click en botón "Crear Documento"
    ↓
Función Deluge ejecuta
    ↓
Obtiene datos: Quote + Account + Contact + Deal
    ↓
Envía POST a: https://opai.gard.cl/docs/api/webhook/zoho
    (también funciona: docs.gard.cl/api/webhook/zoho como alias)
    ↓
Gard Docs recibe y guarda en WebhookSession
    ↓
Retorna sessionId + preview_url
    ↓
Abre modal/popup con preview
    ↓
Usuario selecciona template
    ↓
Ve preview del borrador
    ↓
Click "Enviar por Email"
    ↓
Presentación guardada y enviada al cliente
```

---

## 📝 CÓDIGO DELUGE (Zoho CRM)

> **📄 Ver código completo para copiar:** [`CODIGO-DELUGE-COMPLETO.md`](./CODIGO-DELUGE-COMPLETO.md)

### **Función: `button.crearDocumento` - Versión 2.0 con HMAC Signature**

**Ubicación:** Zoho CRM → Quotes → Custom Button  
**Trigger:** Click en botón personalizado  
**Parámetro:** `quoteId` (ID de la cotización)

```deluge
string button.crearDocumento(String quoteId)
{
    try 
    {
        info "🚀 Iniciando creación de documento...";
        info "📋 Quote ID: " + quoteId;
        
        // 1. Obtener datos de la cotización
        quoteInfo = zoho.crm.getRecordById("Quotes",quoteId);
        if(quoteInfo.isNull())
        {
            info "❌ Error: No se pudo obtener la cotización";
            return "error";
        }
        info "✅ Cotización obtenida";
        
        // 2. Obtener productos
        productDetails = quoteInfo.get("Product_Details");
        if(productDetails.isNull() || productDetails.isEmpty())
        {
            info "❌ Error: La cotización no tiene productos";
            return "error";
        }
        info "✅ Productos obtenidos: " + productDetails.size();
        
        // 3. Preparar payload
        payload = Map();
        payload.put("quote",quoteInfo);
        
        // 4. Obtener Account
        accountLookup = quoteInfo.get("Account_Name");
        if(!accountLookup.isNull())
        {
            accountId = accountLookup.get("id");
            accountInfo = zoho.crm.getRecordById("Accounts",accountId);
            if(!accountInfo.isNull())
            {
                payload.put("account",accountInfo);
                info "✅ Account obtenida: " + accountInfo.get("Account_Name");
            }
        }
        
        // 5. Obtener Contact
        contactLookup = quoteInfo.get("Contact_Name");
        if(!contactLookup.isNull())
        {
            contactId = contactLookup.get("id");
            contactInfo = zoho.crm.getRecordById("Contacts",contactId);
            if(!contactInfo.isNull())
            {
                payload.put("contact",contactInfo);
                info "✅ Contact obtenido: " + contactInfo.get("Full_Name");
            }
        }
        
        // 6. Obtener Deal
        dealLookup = quoteInfo.get("Deal_Name");
        if(!dealLookup.isNull())
        {
            dealId = dealLookup.get("id");
            dealInfo = zoho.crm.getRecordById("Deals",dealId);
            if(!dealInfo.isNull())
            {
                payload.put("deal",dealInfo);
                info "✅ Deal obtenido";
            }
        }
        
        // 7. Procesar productos - CORREGIDO
        products = List();
        for each product in productDetails
        {
            productMap = Map();
            
            // Nombre del producto (de productData)
            productData = product.get("product");
            if(!productData.isNull())
            {
                productMap.put("product_name", productData.get("name"));
            }
            else
            {
                productMap.put("product_name", "Producto");
            }
            
            // ⭐ CORRECCIÓN: Descripción está en product.product_description
            productDescription = product.get("product_description");
            if(!productDescription.isNull() && productDescription != "")
            {
                productMap.put("description", productDescription);
            }
            else
            {
                productMap.put("description", "");
            }
            
            // Cantidades y precios
            productMap.put("quantity", product.get("quantity"));
            productMap.put("unit_price", product.get("list_price"));
            productMap.put("subtotal", product.get("total"));
            
            products.add(productMap);
        }
        payload.put("product_details", products);
        
        // 8. Agregar metadatos
        payload.put("quote_id", quoteId);
        timestamp = zoho.currenttime.toString("yyyy-MM-dd'T'HH:mm:ss");
        payload.put("timestamp", timestamp);
        
        // 9. Generar HMAC-SHA256 signature (machine-to-machine auth)
        secret = "2da045c6e8e4edb4d02b03907c223ed1d8ab401410e20788acaf39b30497ac0d";
        payloadString = payload.toString();
        dataToSign = payloadString + timestamp;
        signature = zoho.encryption.hmacsha256(secret, dataToSign, "hex");
        
        info "🔐 HMAC Signature generada";
        
        // 10. Configurar headers con HMAC signature
        headers = Map();
        headers.put("X-Zoho-Signature", signature);
        headers.put("X-Zoho-Timestamp", timestamp);
        headers.put("Content-Type", "application/json");
        
        // 11. Enviar webhook
        info "📤 Enviando webhook a Gard Docs...";
        webhookUrl = "https://docs.gard.cl/api/webhook/zoho";
        
        response = invokeurl
        [
            url :webhookUrl
            type :POST
            parameters:payload.toString()
            headers:headers
        ];
        
        // 12. DEBUGGING - Ver respuesta completa
        info "📥 Respuesta recibida:";
        info "   - success: " + response.get("success");
        info "   - token: " + response.get("token");
        info "   - preview_url: " + response.get("preview_url");
        info "   - sessionId: " + response.get("sessionId");
        
        // 13. Procesar respuesta
        if(response.get("success") == true)
        {
            previewUrl = response.get("preview_url");
            token = response.get("token");
            
            // Verificar que previewUrl existe
            if(previewUrl == null || previewUrl == "")
            {
                info "❌ ERROR CRÍTICO: preview_url está vacío!";
                info "   Respuesta completa: " + response;
                return "error";
            }
            
            info "✅ Documento creado exitosamente";
            info "   📋 Token: " + token;
            info "   🔗 URL: " + previewUrl;
            info "   🌐 Intentando abrir URL...";
            
            // Intentar abrir URL (puede ser bloqueado por navegador)
            try
            {
                openUrl(previewUrl, "same window");
                info "✅ openUrl ejecutado (si no abrió, revisa bloqueador de popups)";
            }
            catch (openError)
            {
                info "❌ Error al ejecutar openUrl: " + openError;
                info "💡 Abre manualmente: " + previewUrl;
            }
            
            return "success";
        }
        else
        {
            errorMsg = response.get("error");
            info "❌ Error del webhook: " + errorMsg;
            info "   Respuesta completa: " + response;
            return "error";
        }
    }
    catch (e)
    {
        info "❌ Error crítico: " + e.toString();
        return "error";
    }
}
```

---

## 📊 ESTRUCTURA DEL PAYLOAD

### **Datos enviados a Gard Docs:**

```json
{
  "quote": {
    "id": "5847392000001234567",
    "Quote_Number": "COT-2026-00342",
    "Subject": "Servicio de Seguridad 24/7",
    "Grand_Total": 6307000,
    "Sub_Total": 5300000,
    "Tax": 1007000,
    "Valid_Till": "2026-03-04",
    "Created_Time": "2026-02-04T10:30:00",
    "Product_Details": [...],
    // ... todos los campos de la cotización
  },
  
  "account": {
    "id": "5847392000009876543",
    "Account_Name": "Polpaico S.A.",
    "Phone": "+56 2 2123 4567",
    "Website": "https://polpaico.cl",
    "Industry": "Manufactura",
    "RUT__c": "96.810.370-9",
    "Billing_Street": "Av. Américo Vespucio 1501",
    "Billing_City": "Pudahuel",
    // ... todos los campos de la cuenta
  },
  
  "contact": {
    "id": "5847392000005555555",
    "Full_Name": "Roberto González Martínez",
    "First_Name": "Roberto",
    "Last_Name": "González Martínez",
    "Email": "rgonzalez@polpaico.cl",
    "Mobile": "+56 9 8765 4321",
    "Title": "Gerente de Operaciones",
    // ... todos los campos del contacto
  },
  
  "deal": {
    "id": "5847392000007777777",
    "Deal_Name": "Polpaico - Servicio Seguridad",
    "Stage": "Propuesta enviada",
    "Amount": 6307000,
    "Probability": 60,
    "Closing_Date": "2026-03-15",
    // ... todos los campos del deal
  },
  
  "product_details": [
    {
      "product_name": "Guardias de Seguridad 24/7",
      "description": "Servicio de guardias turno 6x1",
      "quantity": 4,
      "unit_price": 950000,
      "subtotal": 3800000
    },
    // ... más productos
  ],
  
  "quote_id": "5847392000001234567",
  "timestamp": "2026-02-04T10:30:00"
}
```

---

## 🔐 AUTENTICACIÓN

### **Método 1: HMAC Signature (Recomendado - Más seguro)**

**Headers requeridos:**

```
X-Zoho-Signature: [HMAC-SHA256 del payload + timestamp]
X-Zoho-Timestamp: 2026-02-06T00:30:00
Content-Type: application/json
```

**Cómo se genera la signature en Deluge:**

```deluge
// 1. Timestamp actual
timestamp = zoho.currenttime.toString("yyyy-MM-dd'T'HH:mm:ss");

// 2. Secret compartido (mismo que ZOHO_WEBHOOK_SECRET en .env.local)
secret = "2da045c6e8e4edb4d02b03907c223ed1d8ab401410e20788acaf39b30497ac0d";

// 3. Datos a firmar (payload + timestamp)
dataToSign = payload.toString() + timestamp;

// 4. Generar HMAC-SHA256 en formato hex
signature = zoho.encryption.hmacsha256(secret, dataToSign, "hex");

// 5. Enviar en headers
headers.put("X-Zoho-Signature", signature);
headers.put("X-Zoho-Timestamp", timestamp);
```

**Beneficios:**
- ✅ Token firmado criptográficamente
- ✅ Protección contra replay attacks (timestamp expira en 5 min)
- ✅ Verifica integridad del payload
- ✅ No reutilizable (cada request tiene signature única)

---

### **Método 2: Bearer Token (Legacy - Compatibilidad)**

**Header requerido:**

```
Authorization: Bearer 2da045c6e8e4edb4d02b03907c223ed1d8ab401410e20788acaf39b30497ac0d
```

**Este token debe coincidir con `ZOHO_WEBHOOK_SECRET` en `.env.local`**

**Nota:** Este método sigue funcionando para compatibilidad, pero se recomienda migrar a HMAC Signature.

---

## 📥 ENDPOINT WEBHOOK (Gard Docs)

### **URL:**
```
POST https://docs.gard.cl/api/webhook/zoho
```

### **Headers esperados (HMAC):**
```
X-Zoho-Signature: [hex signature]
X-Zoho-Timestamp: 2026-02-06T00:30:00
Content-Type: application/json
```

**O (Bearer token legacy):**
```
Authorization: Bearer 2da045c6e8e4edb4d02b03907c223ed1d8ab401410e20788acaf39b30497ac0d
Content-Type: application/json
```

### **Body:** JSON con estructura del payload

### **Respuesta exitosa:**
```json
{
  "success": true,
  "sessionId": "whs_abc123xyz",
  "preview_url": "https://docs.gard.cl/preview/whs_abc123xyz",
  "token": "whs_abc123xyz"
}
```

### **Respuesta de error:**
```json
{
  "success": false,
  "error": "Invalid authentication token"
}
```

---

## 🛠️ CONFIGURACIÓN EN ZOHO CRM

### **1. Crear Custom Function**

1. Ir a: **Setup → Developer Space → Functions**
2. Click **New Function**
3. Nombre: `crearDocumento`
4. Display Name: `Crear Documento`
5. Module: `Quotes`
6. Pegar el código Deluge de arriba
7. Save

### **2. Crear Custom Button**

1. Ir a: **Setup → Modules and Fields → Quotes**
2. Tab: **Links & Buttons**
3. Click **New Button**
4. Configuración:
   - Label: `Crear Documento`
   - Where to display: `Detail Page` y `Edit Page`
   - Display Type: `Custom Button`
   - Function to Execute: `crearDocumento`
   - Execute Function: `onClick`
5. Save

### **3. Agregar botón al layout**

1. Ir a: **Setup → Modules and Fields → Quotes**
2. Tab: **Page Layouts**
3. Editar layout principal
4. Arrastrar botón "Crear Documento" al header
5. Save

---

## ✅ TESTING

### **Test 1: Verificar función Deluge**

```deluge
// Test manual en Zoho Functions
testQuoteId = "5847392000001234567"; // Reemplazar con ID real
result = button.crearDocumento(testQuoteId);
info result; // Debería retornar "success"
```

### **Test 2: Verificar payload recibido**

En Gard Docs, revisar logs del endpoint:
```bash
# Ver logs en Vercel
vercel logs

# O en desarrollo:
# Revisar console.log en terminal
```

### **Test 3: Verificar sesión creada**

```bash
# Abrir Prisma Studio
npx prisma studio

# Ver tabla WebhookSession
# Debería haber un registro con los datos de Zoho
```

---

## 🐛 TROUBLESHOOTING

### **Error: "No se pudo obtener la cotización"**
- Verificar que el `quoteId` sea válido
- Verificar permisos en Zoho CRM

### **Error: "La cotización no tiene productos"**
- Agregar al menos un producto a la cotización
- Verificar que Product_Details no esté vacío

### **Error: "Invalid authentication token" o "Invalid signature"**
- **HMAC:** Verificar que el secret en Deluge coincida con `ZOHO_WEBHOOK_SECRET`
- **HMAC:** Verificar que `X-Zoho-Signature` y `X-Zoho-Timestamp` se estén enviando
- **Bearer:** Verificar que el token en Deluge coincida con `ZOHO_WEBHOOK_SECRET`
- **Bearer:** Revisar que el header `Authorization` se esté enviando

### **Error: "Request timestamp expired"**
- El timestamp del webhook es mayor a 5 minutos
- Revisar hora del servidor de Zoho vs hora del servidor de Gard Docs
- Zoho debe enviar timestamp actual: `zoho.currenttime`

### **Error: "Endpoint no responde"**
- Verificar que `https://docs.gard.cl` esté desplegado
- Verificar que `/api/webhook/zoho` exista
- Revisar logs de Vercel

---

## 📝 NOTAS IMPORTANTES

### **Campos requeridos en Zoho:**

Para que la integración funcione correctamente, la cotización debe tener:

- ✅ **Quote** completa con productos
- ✅ **Account** (cliente) vinculado
- ✅ **Contact** vinculado
- ⚠️ **Deal** (opcional pero recomendado)

### **Timeout:**

- Zoho tiene timeout de 30 segundos para funciones
- Si el webhook tarda más, aumentar timeout en Zoho
- O implementar webhook asíncrono

### **Rate Limiting:**

- Zoho limita calls a 100/día en plan gratuito
- Plan Pro: 1000/día
- Considerar implementar cache si se usa mucho

---

## 🔄 PRÓXIMAS MEJORAS

- [ ] Webhook asíncrono (para evitar timeouts)
- [ ] Retry automático en caso de fallo
- [ ] Notificación a Slack cuando se crea documento
- [ ] Log de eventos en Zoho CRM
- [ ] Soporte para múltiples templates desde Zoho
- [ ] Preview inline en iframe (sin popup)

---

## 🔗 RECURSOS

**Documentación Zoho:**
- [Deluge Scripting](https://www.zoho.com/deluge/)
- [CRM API](https://www.zoho.com/crm/developer/docs/)
- [Webhooks](https://www.zoho.com/crm/developer/docs/api/webhooks.html)

**Documentación Gard Docs:**
- [Estado del Proyecto](ESTADO-PROYECTO.md)
- [Database Schema](DATABASE-SCHEMA.md)
- [Tokens disponibles](TOKENS-ZOHO.md)

---

## 🔄 MIGRACIÓN A HMAC SIGNATURE

### **¿Por qué migrar?**

- ✅ **Más seguro:** Signature firmada criptográficamente
- ✅ **Protección replay attacks:** Timestamp expira en 5 minutos
- ✅ **Integridad:** Verifica que el payload no fue modificado
- ✅ **Gold standard:** Machine-to-machine auth profesional

### **Pasos para migrar:**

**1. Actualizar código Deluge en Zoho CRM:**

Reemplaza estas líneas (paso 9):

```deluge
// ANTES (Bearer token simple)
headers = Map();
headers.put("Authorization", "Bearer 2da045c6...");
headers.put("Content-Type", "application/json");
```

Por estas (HMAC signature):

```deluge
// DESPUÉS (HMAC signature)
secret = "2da045c6e8e4edb4d02b03907c223ed1d8ab401410e20788acaf39b30497ac0d";
payloadString = payload.toString();
dataToSign = payloadString + timestamp;
signature = zoho.encryption.hmacsha256(secret, dataToSign, "hex");

headers = Map();
headers.put("X-Zoho-Signature", signature);
headers.put("X-Zoho-Timestamp", timestamp);
headers.put("Content-Type", "application/json");
```

**2. Probar con cotización de prueba**

**3. Verificar en logs:**
- Debe aparecer: "🔐 Verificando HMAC signature..."
- Debe aparecer: "✅ HMAC signature válida"

**Nota:** El Bearer token legacy sigue funcionando durante la migración.

---

**Última actualización:** 06 de Febrero de 2026  
**Autor:** Carlos Irigoyen (Gard Security)  
**Estado:** ⏳ Webhook en desarrollo
