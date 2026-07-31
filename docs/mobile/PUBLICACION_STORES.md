# Publicación App Store / Google Play — Apps Capacitor Opai

Runbook para compilar e instalar en dispositivo las apps iOS-first y preparar el envío a tiendas. **No** cubre certificados, cuentas de developer ni el submit final (esos pasos viven en runbooks aparte de Gard Security).

## Apps publicables

| App | `CAPACITOR_APP` | appId / bundleId | `server.url` | Push nativo |
|---|---|---|---|---|
| Opai ERP | `erp` | `cl.opai.erp` | `https://www.opai.cl/opai/login` | Sí (admin) |
| Opai Terreno | `terreno` | `cl.opai.terreno` | `https://www.opai.cl/portal/terreno` | No (dispositivo compartido) |
| Opai Clientes | `cliente` | `cl.opai.cliente` | `https://www.opai.cl/portal/cliente` | Sí (contact) |

`personas` (`cl.opai.personas`) permanece en el repo para workflows locales; **no** se publica en esta iteración.

Selector: `capacitor.config.ts` lee `CAPACITOR_APP` (default `personas`). Los scripts `npm run cap:<app>:*` setean la env var y mueven `android`/`ios` ↔ `android-<app>`/`ios-<app>` (gitignoreadas).

## Secuencia de build (iOS)

Desde la raíz del monorepo, en una máquina con Xcode + CocoaPods:

```bash
# 1. Stub webDir (automático en los scripts; o manual)
node scripts/cap-ensure-webdir.mjs

# 2. Regenerar iconos/splash fuente (si cambió el branding)
node scripts/generate-app-resources.mjs

# 3. Init nativo (una vez por app)
npm run cap:erp:ios:init
npm run cap:terreno:ios:init
npm run cap:cliente:ios:init

# 4. Generar asset catalogs nativos (tras init; requiere @capacitor/assets)
npx @capacitor/assets generate --assetPath resources/erp --ios --android
# repetir para resources/terreno y resources/cliente (con la carpeta ios/android
# de esa app montada — los scripts sync hacen el swap)

# 5. Sync + abrir
npm run cap:erp:ios:sync
npm run cap:erp:ios:open
# Ídem terreno / cliente
```

Android: mismos scripts sin `:ios` (`cap:erp:init`, `cap:erp:sync`, `cap:erp:open`).

Tras cualquier `cap:*`, el working tree debe quedar limpio: no hay `cp` de `capacitor.config.ts` ni checkout.

## Push nativo (FCM HTTP v1)

1. Crear proyecto Firebase (o reutilizar el de Gard) y habilitar Cloud Messaging.
2. Descargar el JSON del **service account** (Firebase Console → Project settings → Service accounts → Generate new private key).
3. En Vercel (y `.env.local` local), setear:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"…",…}'
```

Si falta la variable, `src/lib/notifications/fcm-sender.ts` es no-op (un solo `console.warn`); web-push VAPID sigue funcionando.

4. En iOS: configurar APNs key en Firebase y el capability Push Notifications en Xcode.
5. En Android: colocar `google-services.json` en el proyecto nativo (post-init).

Registro de tokens: ERP (`AppLayoutClient`) y Portal Cliente montan `NativePushRegistrar` → `POST /api/push/register`. Terreno **no** registra tokens.

## Info.plist — textos de uso (iOS)

Agregar / verificar en cada target iOS tras `cap add ios`:

| Key | Valor sugerido |
|---|---|
| `NSCameraUsageDescription` | Opai necesita la cámara para capturar evidencias operativas y documentos. |
| `NSFaceIDUsageDescription` | Opai usa Face ID para desbloquear el acceso de forma segura. |
| `NSLocationWhenInUseUsageDescription` | Opai usa tu ubicación para validar marcaciones y rondas en terreno. |
| `ITSAppUsesNonExemptEncryption` | `NO` (export compliance — solo HTTPS estándar) |

## Guideline Apple 4.8

En iOS nativo (`Capacitor.getPlatform() === "ios" && isNativePlatform()`), los logins **no** muestran "Continuar con Google" (ERP, Platform, UnifiedLoginCard). El camino queda email/clave o email+PIN. Web y Android conservan Google.

## Checklist pre-submit

- [ ] `npm run cap:<app>:ios:sync` sin ensuciar `git status`
- [ ] Icono 1024 + splash generados con `@capacitor/assets`
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON` en Vercel Production
- [ ] Push smoke: abrir app autenticada → fila en `push_tokens` con `platform=ios`
- [ ] Enviar notificación de prueba → llega al dispositivo; token inválido queda `isActive=false`
- [ ] Login iOS sin botón Google
- [ ] Screenshots y privacy nutrition labels por listing
