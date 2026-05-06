# Sandbox cesión electrónica — Bloque 0

> **Pre-requisito obligatorio del plan factoring v3.** Ejecutá este sandbox
> ANTES de implementar los bloques 1-10. Si el SII no devuelve un estado
> aceptado o en proceso, hay un problema sistémico que hay que resolver
> antes de seguir con código en la app.

## Qué hace

Prueba el flujo completo de cesión electrónica de una factura DTE
(Generar AEC → Enviar al SII → Confirmar estado en RPETC) contra el
ambiente de **certificación** del SII, usando:

- **SimpleAPI** para generar y enviar el AEC firmado.
- **SOAP directo al SII** (`wsRPETCConsulta`) para confirmar el estado
  oficial usando el certificado digital del tenant. Sin OAuth, sin
  onboarding adicional con el SII.

Si pasa, podemos confiar en el flujo end-to-end y ejecutar los bloques
1-10 (schema Prisma, adapter, services, UI, cron) como ejecución
mecánica.

## Pre-requisitos

1. `SIMPLEAPI_KEY` — la API key de SimpleAPI ya configurada en Opai
   (mismo valor que la env var `SIMPLEAPI_KEY` de producción).
2. **Certificado digital `.pfx`** del tenant (Gard u otro) + password.
   Es el mismo cert que está cargado en Opai (`TenantDteCertificate`).
3. **Path al XML del DTE** que vamos a ceder. Tiene que ser un DTE tipo
   33 emitido en certificación al receptor de pruebas SII (`55555555-5`).
   Lo podés exportar desde Opai con el botón "Descargar XML" en la
   ficha de la factura emitida (módulo Finanzas → Facturas).
4. Datos del **cesionario de prueba**: en certificación SII no valida
   identidad, así que podés usar un RUT real cualquiera (ej.
   `12345678-9`, razón social `FACTORING TEST`).

## Ejecución

```bash
SIMPLEAPI_KEY=xxx npx tsx scripts/factoring/cesion-sandbox.ts \
  --cert ./tmp/cert.pfx --cert-pwd "PWD" \
  --rut-titular RUT-DEL-CERT \
  --dte-xml ./tmp/dte_33_1234.xml \
  --rut-emisor RUT-EMPRESA-CEDENTE --razon-emisor "MI EMPRESA SPA" \
  --direccion-emisor "Av. Provi 123" --email-emisor "fac@miempresa.cl" \
  --rut-cesionario RUT-FACTORING --razon-cesionario "FACTORING TEST" \
  --direccion-cesionario "Calle Test 1" --email-cesionario "test@fac.cl" \
  --monto-cesion 119000 --fecha-vencimiento 2026-06-30 \
  --out-dir ./tmp/sandbox-cesion
```

> Reemplazá `RUT-DEL-CERT`, `RUT-EMPRESA-CEDENTE` y `RUT-FACTORING`
> por los RUTs reales (formato `XXXXXXXX-X` con guión y dígito
> verificador). En **certificación** el SII no valida identidad de
> los participantes, así que para el cesionario podés usar un RUT
> ficticio cualquiera con DV válido.

`npx tsx` descarga `tsx` la primera vez (no agrega nada a
`package.json`). El script no hace nada destructivo: solo escribe
artefactos en `--out-dir`.

## Modo `--check-only` (read-only)

Si solo querés **consultar el estado** de un TrackId existente (cesión
ya enviada por Opai u otro sistema, manualmente o por el flujo
anterior), usá el flag `--check-only`. En este modo el script:

- Saltea pasos 1 y 2 (no llama a SimpleAPI)
- Solo hace auth SOAP con el cert + `getEstEnvio` contra el SII
- Es **completamente read-only**: no modifica nada en SII

Útil para validar la integración SOAP contra una cesión real ya
anotada en producción, sin emitir nada nuevo.

```bash
npx tsx scripts/factoring/cesion-sandbox.ts \
  --check-only \
  --cert ./tmp/cert.pfx --cert-pwd "PWD" \
  --rut-titular "RUT-DEL-CERT" \
  --track-id 11998878336 \
  --ambiente production \
  --out-dir ./tmp/check-prod-cesion
```

En modo check-only solo se generan `05-signed-seed.xml`,
`06-est-envio-response.xml` y `REPORT.md` (los archivos `01-04` son
de SimpleAPI y se omiten).

## Verificación de tipado (sin DB)

```bash
npx tsc --noEmit -p scripts/factoring/tsconfig.json
```

Este `tsconfig.json` scoped extiende el del proyecto pero excluye
`.next/` (paths generados por Next dev que ensucian el output base).
Sirve para validar el código del Bloque 0 sin depender del estado
global del repo.

## Outputs

Todos en `--out-dir` (default `./tmp/sandbox-cesion`):

| Archivo | Descripción |
|---|---|
| `01-generar-request.json` | Payload enviado a `dte/cesion/generar` |
| `01-generar-response.bin` | Response cruda de SimpleAPI |
| `02-aec.xml` | AEC firmado (latin1) |
| `03-enviar-request.json` | Payload de `cesion/enviar` |
| `04-enviar-response.json` | Response con `TrackId` |
| `05-signed-seed.xml` | Semilla SII firmada con el cert |
| `06-est-envio-response.xml` | Response SOAP `getEstEnvio` |
| `REPORT.md` | Resumen ejecutivo con veredicto |

## Códigos de salida

- **0** — Éxito (`ESTADO_ENVIO ∈ {EOK, EPR, UPL, RCP, SOK, FSO, COK, VDC, VCS}`).
  El flujo está validado. Procedé con bloques 1-10.
- **1** — Error sistémico (cert vencido, payload inválido, network, etc.).
  Revisá el output del script.
- **2** — SII rechazó (`ESTADO_ENVIO ∈ {RSC, RFS, RCR, RDC, RCS, EAN}`).
  Revisá `02-aec.xml` para entender qué falló.

## Mapeo de estados oficiales SII

Tomado de `ws_consulta_estado_aec.pdf` v1.2 del SII.

### Aceptados (terminal)

| Código | Descripción | Veredicto |
|---|---|---|
| `EOK` | Envío Aceptado | ✅ APPROVED |
| `EPR` | Envío en Proceso de Carga (terminal aceptado) | ✅ APPROVED |

### En proceso (no terminal — esperar)

| Código | Descripción |
|---|---|
| `UPL` | Envío Recibido en Upload |
| `RCP` | Envío Recepcionado |
| `SOK` | Schema OK |
| `FSO` | Firma Sobre OK |
| `COK` | Carátula OK |
| `VDC` | Validación Documentos OK |
| `VCS` | Validación Cesiones OK |

Si el sandbox termina con uno de estos, el flujo está bien — solo SII
está tardando. Re-ejecutar dentro de unos minutos debería dar `EOK`.

### Rechazados (terminal)

| Código | Descripción | Acción |
|---|---|---|
| `RSC` | Rechazo Schema | Revisar AEC vs schema oficial |
| `RFS` | Rechazo Firma Sobre | Cert mal firmado |
| `RCR` | Rechazo Carátula | Datos del cedente/cesionario |
| `RDC` | Rechazo Documentos | DTE original con problema |
| `RCS` | Rechazo Cesiones | Lógica de cesión inválida |
| `EAN` | Envío Anulado | Anulado por operador |

Si el sandbox termina con uno de estos, escalar al equipo + revisar el
AEC en `02-aec.xml`.

## Errores frecuentes

### `Auth SOAP falló: GetTokenFromSeed sin TOKEN`

Causa típica: el certificado digital **no tiene permisos** en el SII
para usar los servicios web (DTE, RPETC). Solución: el titular del
cert debe ir a `https://herculesr.sii.cl` y aceptar los términos de
uso de los servicios web. Esto se hace UNA vez por cert.

### `cert vencido`

El cert digital tiene fecha de vencimiento (~1 año típicamente). Hay
que renovarlo con el proveedor que lo emitió (E-Sign, E-Cert, etc.).

### `RUT del titular incorrecto`

El RUT pasado en `--rut-titular` debe coincidir con el RUT del
**representante legal** que figura dentro del cert digital, no con el
RUT de la empresa. En Opai está guardado en
`TenantDteCertificate.rutTitular`.

### `AEC NO tiene Recibo Electrónico ni Declaración Jurada`

El AEC generado por SimpleAPI no incluye la declaración jurada
obligatoria por Ley 19.983. Esto invalidaría el mérito ejecutivo de
la cesión. Hay que pedirle a Chilesystems (SimpleAPI) que la incluya
automáticamente o agregar un campo en el payload `DocumentoAEC` que la
fuerce.

### `RECHAZADO POR SII — Estado: RSC` (Rechazo Schema)

El XML del AEC no respeta el schema oficial. Esto suele venir de:
- Tipos de DTE no cesibles (boletas, notas de débito).
- Faltan campos obligatorios en el JSON enviado a `dte/cesion/generar`.
- Caracteres latin1 mal codificados en razones sociales.

Comparar `02-aec.xml` contra el schema XSD oficial del SII (publicado
en https://www.sii.cl/factura_electronica).

## Después del sandbox

1. **Si veredicto es ÉXITO** → reportar a Cursor con el `REPORT.md`
   adjunto y proceder con bloques 1-10.
2. **Si EN PROCESO** → re-ejecutar el sandbox en 1-5 min para
   confirmar que pasa a `EOK`. El flujo está validado.
3. **Si RECHAZADO** → no avanzar con bloques 1-10. Resolver el rechazo
   primero (puede ser config de SimpleAPI, cert sin permisos, datos
   del cesionario inválidos, etc.).
