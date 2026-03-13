# Flujos de Marcación

OPAI tiene **dos flujos** de marcación digital. Ambos exigen GPS obligatorio y usan el mismo backend.

---

## 1. Flujo público (link compartido)

**URL:** `/marcar/[code]`  
**Componente:** `MarcacionClient`  
**Ejemplo:** `https://app.gardsuite.com/marcar/ABC123`

| Aspecto | Detalle |
|---------|---------|
| **Acceso** | Cualquiera con el link puede abrir la página |
| **Identificación** | RUT + PIN en la misma pantalla |
| **Método** | Solo RUT + PIN (foto de evidencia opcional) |
| **Dispositivo** | Cualquiera: celular personal, tablet, PC |
| **Uso típico** | QR impreso en la caseta, link por WhatsApp, kiosco con navegador |

**Cuándo usarlo:** Guardias que marcan desde su celular personal, instalaciones sin dispositivo corporativo, o cuando se comparte un link/QR fijo.

---

## 2. Portal de marcación (dispositivo emparejado)

**URL:** `/portal/marcacion`  
**Componente:** `MarcacionScreen` (dentro de `MarcacionPortalApp`)  
**Requiere:** Pairing previo del dispositivo con la instalación

| Aspecto | Detalle |
|---------|---------|
| **Acceso** | Solo dispositivos emparejados con token válido |
| **Identificación** | RUT → luego Face ID o PIN como fallback |
| **Método** | Face ID (principal) o PIN (fallback) |
| **Dispositivo** | Tablet/celular corporativo asignado a la instalación |
| **Uso típico** | Tablet fija en la caseta, celular del supervisor de turno |

**Cuándo usarlo:** Instalaciones con dispositivo corporativo en sitio, cuando se quiere Face ID para mayor seguridad.

---

## Resumen

| | Flujo público | Portal |
|---|---------------|--------|
| **URL** | `/marcar/[code]` | `/portal/marcacion` |
| **Auth** | Ninguna (link público) | Token de dispositivo emparejado |
| **Identificación** | RUT + PIN | RUT → Face ID o PIN |
| **GPS** | Obligatorio | Obligatorio |
| **Backend** | `POST /api/public/marcacion/registrar` | `POST /api/public/marcacion/face-verify` o `registrar` (PIN) |

---

## ¿Por qué dos flujos?

- **Flujo público:** Máxima flexibilidad. Un solo link sirve para todos los guardias de una instalación. No requiere configuración de dispositivos.
- **Portal:** Mayor seguridad con Face ID y control de qué dispositivos pueden marcar. Ideal para instalaciones con equipo dedicado.
