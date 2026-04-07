# Deal Pipeline Stepper + Cotizacion Activa

## Resumen

Agregar un stepper visual de pipeline en la pagina de detalle de negocio (deal) que reemplaza el dropdown actual de etapa. Ademas, marcar la cotizacion activa en el panel de registros asociados y mejorar la logica de cancelacion de seguimientos.

## Cambios

### 1. Pipeline Stepper Visual

**Ubicacion:** Debajo del header, arriba de las tabs. Reemplaza el `<Select>` de etapa.

**UI:**
- Barra horizontal con segmentos tipo chevron conectados
- Etapas abiertas en secuencia, Ganado/Perdido como botones pill separados al final
- Estados visuales:
  - Completada (orden < actual): fondo tenue, check sutil
  - Actual: fondo color de etapa, texto blanco
  - Futura (orden > actual): fondo gris/muted
  - Ganado/Perdido: botones pill outline, resaltados cuando activos

**Comportamiento:**
- Clic en etapa abierta: cambio inmediato (optimistic update)
- Clic en "Ganado": modal de confirmacion con mensaje sobre consecuencias (cancela seguimientos, crea notificacion de contrato)
- Clic en "Perdido": cambio directo sin modal
- Si deal ya esta Ganado/Perdido: stepper desactivado, boton correspondiente resaltado
- Responsive: scroll horizontal en pantallas chicas

### 2. Cancelacion de seguimientos en Negociacion

**Archivo:** `src/app/api/crm/deals/[id]/stage/route.ts`

Actualmente solo cancela seguimientos en Ganado/Perdido. Se agrega cancelacion cuando la etapa destino es "Negociacion".

```
if (nextStatus === "won" || nextStatus === "lost" || stage.name === "Negociacion") {
  cancelPendingFollowUps(...)
}
```

### 3. Badge "Activa" en cotizaciones

En el panel de registros asociados, la cotizacion cuyo `quoteId === activeQuotationId` muestra un badge adicional verde "Activa" junto al badge de estado existente.

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/crm/CrmDealDetailClient.tsx` | Nuevo componente DealPipelineStepper, remover Select de etapa, modal Ganado, badge Activa |
| `src/app/api/crm/deals/[id]/stage/route.ts` | Cancelar seguimientos en "Negociacion" |
| `src/components/crm/EntityDetailLayout.tsx` | Agregar slot para stepper entre header y tabs (si es necesario) |
