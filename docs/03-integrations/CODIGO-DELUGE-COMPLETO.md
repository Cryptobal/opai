# 📋 Código Deluge COMPLETO - Botón Crear Documento

**Resumen:** Código Deluge completo y funcional para crear documentos desde Zoho CRM con autenticación HMAC.

**Estado:** Vigente - Código en producción

**Scope:** OPAI Docs - Integraciones

---

**Versión:** 2.0 - Con HMAC Signature Auth  
**Fecha:** 06 de Febrero de 2026  
**Ubicación:** Zoho CRM → Quotes → Custom Button

---

## 🔐 CÓDIGO COMPLETO (Copiar y Pegar)

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
            accountId = accountLookup.get("id").toLong();
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
            contactId = contactLookup.get("id").toLong();
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
            dealId = dealLookup.get("id").toLong();
            dealInfo = zoho.crm.getRecordById("Deals",dealId);
            if(!dealInfo.isNull())
            {
                payload.put("deal",dealInfo);
                info "✅ Deal obtenido";
            }
        }
        
        // 7. Procesar productos
        products = List();
        for each product in productDetails
        {
            productMap = Map();
            
            // Nombre del producto
            productData = product.get("product");
            if(!productData.isNull())
            {
                productMap.put("product_name", productData.get("name"));
            }
            else
            {
                productMap.put("product_name", "Producto");
            }
            
            // Descripción del producto
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
        webhookUrl = "https://opai.gard.cl/docs/api/webhook/zoho"; // También funciona: docs.gard.cl/api/webhook/zoho
        
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

## 🔐 CONFIGURACIÓN

### **Secret Key:**

El secret debe coincidir EXACTAMENTE con `ZOHO_WEBHOOK_SECRET` en tu `.env.local`:

```
2da045c6e8e4edb4d02b03907c223ed1d8ab401410e20788acaf39b30497ac0d
```

**Línea 107 del código:**
```deluge
secret = "2da045c6e8e4edb4d02b03907c223ed1d8ab401410e20788acaf39b30497ac0d";
```

---

## 📋 PASOS PARA ACTUALIZAR EN ZOHO

### **1. Ir a la función Deluge:**
- Zoho CRM → Setup → Developer Space → Functions
- Buscar función: `button.crearDocumento`

### **2. Reemplazar código completo:**
- Seleccionar todo el código actual
- Copiar y pegar el código de arriba
- **Save**

### **3. Probar con cotización:**
- Ir a Quotes
- Abrir una cotización con productos
- Click en botón "Crear Documento"
- Verificar que abre el preview

### **4. Revisar logs:**
En Zoho CRM → Setup → Developer Space → Functions → View Logs

Deberías ver:
```
🚀 Iniciando creación de documento...
📋 Quote ID: 6153766000024780001
✅ Cotización obtenida
✅ Productos obtenidos: 3
✅ Account obtenida: Polpaico Soluciones
✅ Contact obtenido: Daniel Troncoso
✅ Deal obtenido
🔐 HMAC Signature generada
📤 Enviando webhook a Gard Docs...
📥 Respuesta recibida:
✅ Documento creado exitosamente
```

---

## ⚠️ IMPORTANTE

**Si tienes problemas después de actualizar:**

Puedes volver temporalmente al Bearer token simple (líneas 110-113):

```deluge
// Método legacy (mientras debuggeas)
headers = Map();
headers.put("Authorization", "Bearer 2da045c6e8e4edb4d02b03907c223ed1d8ab401410e20788acaf39b30497ac0d");
headers.put("Content-Type", "application/json");
```

El backend soporta **ambos métodos** simultáneamente.

---

**Última actualización:** 06 de Febrero de 2026
