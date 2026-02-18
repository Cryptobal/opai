# Intent: Marcacion digital de asistencia

> **Creado:** 2026-02-18

## Intencion del usuario

Preguntas como:
- "Como marca un guardia su entrada?"
- "Donde configuro el PIN?"
- "Como genero el QR de la instalacion?"
- "Que pasa si el guardia no tiene GPS?"

## Respuesta esperada

### Como funciona la marcacion
1. El guardia abre el link de marcacion en su celular (via QR o link directo).
2. Ingresa su RUT y PIN de 4-6 digitos.
3. El sistema captura la geolocalizacion del celular.
4. Si esta dentro del radio de la instalacion, puede marcar "Entrada" o "Salida".
5. Se registra la marcacion con hash SHA-256 de integridad.
6. Se envia comprobante por email automaticamente.
7. Se actualiza automaticamente la asistencia diaria (checkInAt/checkOutAt).

### Si no tiene GPS
- **Sin GPS = no puede marcar.** La geolocalizacion es obligatoria y bloqueante.
- Si esta fuera del radio de la instalacion = **marcacion rechazada** (403).

### Configurar PIN del guardia
1. Ir a **Personas > Guardias > [guardia]**.
2. Buscar seccion "Marcacion".
3. Presionar "Asignar PIN" o "Resetear PIN".
4. El PIN se muestra una sola vez al generarlo.

### Generar QR de instalacion
1. Ir a la ficha de la instalacion en CRM.
2. Buscar seccion "Marcacion digital".
3. Presionar "Generar codigo".
4. Descargar/imprimir el QR generado.
5. El radio de geofence es configurable (default 100m).

## URLs canonicas

- Marcacion publica: `/marcar/[code]`
- Marcaciones admin: `/ops/marcaciones`
- Ficha del guardia: `/personas/guardias/[id]`

## Normativa
- Cumple Resolucion Exenta N°38 DT Chile (10/13 requisitos cumplidos).
- Pendientes para certificacion: portal DT, alertas de jornada, FEA en reportes.
