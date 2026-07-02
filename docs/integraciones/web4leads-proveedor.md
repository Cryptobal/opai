# Integración Web4Leads → Opai — Movimientos bancarios

**Versión:** 1.0
**Contacto técnico Opai:** Carlos

Cómo Web4Leads debe enviar los movimientos bancarios a Opai en tiempo real,
mediante un webhook HTTP firmado, para la conciliación bancaria.

---

## 1. Credenciales de conexión

| Dato       | Valor                                                            |
|------------|------------------------------------------------------------------|
| **URL**    | `{{URL}}`                                                        |
| **Secret** | `{{SECRET}}`                                                     |

> **No hay un "token de API" aparte.** La autenticación es la **firma HMAC** que
> se calcula con el Secret (sección 3). La URL identifica la empresa; el Secret
> prueba que el envío es legítimo. Quien no tenga el Secret no puede enviar
> movimientos, aunque conozca la URL.
>
> El Secret es sensible: guardarlo de forma segura, no exponerlo en logs ni en
> repositorios.

---

## 2. Endpoint

Un único endpoint. Web4Leads envía, Opai recibe y responde en el momento.

```
POST {{URL}}
Content-Type: application/json
```

---

## 3. Autenticación (HMAC-SHA256)

Cada request debe incluir dos headers:

| Header                    | Descripción                                                      |
|---------------------------|------------------------------------------------------------------|
| `x-web4leads-timestamp`   | Marca de tiempo Unix en **segundos** (UTC) al momento del envío. |
| `x-web4leads-signature`   | Firma HMAC-SHA256 en hexadecimal (minúsculas).                   |

**Cálculo de la firma:**

```
mensaje    = body_crudo + timestamp
signature  = HMAC_SHA256(Secret, mensaje)   → hexadecimal
```

> `body_crudo` es exactamente el mismo string JSON enviado en el body, sin
> reformatear. La firma se calcula sobre `body + timestamp` concatenados, en ese
> orden, sin separador.

La marca de tiempo debe estar dentro de una ventana de **±5 minutos** respecto a
la hora del servidor. Fuera de esa ventana el request se rechaza (anti-replay).

---

## 4. Body (JSON)

```json
{
  "accountNumber": "0-000-12345678-9",
  "bankCode": "SANTANDER",
  "movements": [
    {
      "externalId": "w4l-2026-05-21-000123",
      "transactionDate": "2026-05-21",
      "description": "TRANSFERENCIA DE CLIENTE XYZ SPA",
      "reference": "RUT 12.345.678-9",
      "amount": 1500000,
      "balance": 8750000
    }
  ]
}
```

### Nivel raíz

| Campo           | Tipo   | Requerido | Descripción                                                                |
|-----------------|--------|-----------|-----------------------------------------------------------------------------|
| `accountNumber` | string | Sí        | Número de cuenta bancaria. Clave principal para asignar el movimiento.     |
| `bankCode`      | string | No        | Banco de la cuenta. Solo se usa para desambiguar si hay cuentas repetidas. |
| `movements`     | array  | Sí        | Lista de movimientos (1 a 500 por request).                                |

### Cada movimiento

| Campo             | Tipo            | Requerido | Descripción                                                                  |
|-------------------|-----------------|-----------|-------------------------------------------------------------------------------|
| `externalId`      | string          | Sí        | ID único del movimiento en Web4Leads. Se usa para deduplicar (sección 6).    |
| `transactionDate` | string          | Sí        | Fecha del movimiento, formato `YYYY-MM-DD`.                                   |
| `description`     | string          | Sí        | Glosa o descripción del movimiento.                                          |
| `reference`       | string \| null  | No        | Referencia, número de operación o RUT de la contraparte.                     |
| `amount`          | number          | Sí        | Monto en CLP. **Positivo = abono / entrada. Negativo = cargo / salida.**     |
| `balance`         | number \| null  | No        | Saldo de la cuenta tras el movimiento. Si se envía, Opai actualiza el saldo. |

> **`accountNumber`:** Opai compara solo los dígitos, ignorando guiones, puntos y
> espacios. `"0-000-12345678-9"`, `"000123456789"` y `"0.000.12345678.9"` son la
> misma cuenta.

> **Signo de `amount`:** debe reflejar el efecto en el saldo. Depósito o
> transferencia recibida = positivo; giro, pago o comisión = negativo. No enviar
> todo positivo.

---

## 5. Respuestas

| HTTP  | Body                                                       | Significado                                                       | ¿Reintentar? |
|-------|------------------------------------------------------------|------------------------------------------------------------------|--------------|
| `200` | `{ "success": true, "imported": N, "duplicates": M }`      | Procesado. `N` nuevos, `M` ya existían y se ignoraron.           | No           |
| `200` | `{ "success": true, "skipped": "bank_account_not_found" }` | La cuenta aún no está registrada en Opai. El equipo fue avisado. | No           |
| `200` | `{ "success": true, "skipped": "tenant_not_found" }`       | La URL no corresponde a una empresa. Revisar la URL.             | No           |
| `401` | `{ "success": false, "error": "..." }`                     | Firma o timestamp inválido.                                      | No           |
| `400` | `{ "success": false, "error": "..." }`                     | Payload mal formado (el `error` indica el campo).                | No           |
| `5xx` | —                                                          | Error transitorio del servidor.                                  | **Sí**       |

### Política de reintentos

Reintentar **solo** ante `5xx` o fallos de red (timeout, conexión). Backoff
exponencial recomendado: 1s, 5s, 30s, 5min, 30min — máximo 6 intentos. Gracias a
la deduplicación por `externalId`, reintentar es seguro y no duplica movimientos.
No reintentar ante `400` ni `401`.

---

## 6. Idempotencia (evitar duplicados)

Opai usa `externalId` como clave única por cuenta. Si se reenvía un movimiento
con un `externalId` ya recibido, se ignora y se cuenta en `duplicates`. Esto hace
que los reintentos sean 100% seguros.

**Requisito:** el `externalId` debe ser estable y único por movimiento — el mismo
movimiento bancario lleva siempre el mismo `externalId` en cada envío.

---

## 7. Recomendaciones de envío

- **Tiempo real:** un POST por movimiento apenas se detecta, con un solo elemento
  en `movements`. Es lo ideal.
- **Por lotes:** máximo 500 por request, ordenados por fecha ascendente. Si
  supera 500, dividir en varios POST.
- Enviar movimientos de **una sola cuenta** por request.

---

## 8. Ejemplo (bash / curl)

```bash
SECRET="{{SECRET}}"
URL="{{URL}}"

TIMESTAMP=$(date +%s)
BODY='{"accountNumber":"0-000-12345678-9","bankCode":"SANTANDER","movements":[{"externalId":"w4l-001","transactionDate":"2026-05-21","description":"TRANSFERENCIA CLIENTE XYZ","reference":"RUT 12.345.678-9","amount":1500000,"balance":8750000}]}'

SIGNATURE=$(printf '%s' "${BODY}${TIMESTAMP}" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-web4leads-timestamp: $TIMESTAMP" \
  -H "x-web4leads-signature: $SIGNATURE" \
  -d "$BODY"
```

## 9. Ejemplo (Node.js)

```javascript
const crypto = require("crypto");

async function enviarMovimientos(url, secret, accountNumber, bankCode, movements) {
  const body = JSON.stringify({ accountNumber, bankCode, movements });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body + timestamp)
    .digest("hex");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-web4leads-timestamp": timestamp,
      "x-web4leads-signature": signature,
    },
    body,
  });
  return { status: res.status, data: await res.json() };
}
```

## 10. Ejemplo (PHP)

```php
<?php
function enviarMovimientos($url, $secret, $payloadArray) {
    $body = json_encode($payloadArray, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $timestamp = (string) time();
    $signature = hash_hmac('sha256', $body . $timestamp, $secret);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-web4leads-timestamp: ' . $timestamp,
            'x-web4leads-signature: ' . $signature,
        ],
        CURLOPT_POSTFIELDS => $body,
    ]);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => $response];
}
```

> **Nota PHP:** firmar exactamente el mismo string que se envía. Usar la misma
> variable `$body` para firmar y para `POSTFIELDS` (no recodificar).

---

## 11. Checklist de integración

- [ ] Guardar la **URL** y el **Secret** de la sección 1 de forma segura.
- [ ] Implementar la firma `HMAC_SHA256(Secret, body + timestamp)` en hex.
- [ ] Enviar los headers `x-web4leads-timestamp` y `x-web4leads-signature`.
- [ ] Usar `externalId` estable y único por movimiento.
- [ ] Respetar el signo de `amount` (+ entra, − sale).
- [ ] Reintentos solo ante `5xx` / errores de red, con backoff.
- [ ] Probar y confirmar `{"success":true,"imported":1}`.
- [ ] Confirmar que reenviar el mismo `externalId` da `duplicates: 1`.
