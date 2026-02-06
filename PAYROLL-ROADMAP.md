# 🗺️ PAYROLL MODULE - ROADMAP TÉCNICO

## ✅ FASE 1: BASE FUNCIONAL (COMPLETADA)

**Estado**: Implementado y operativo
**Fecha**: Febrero 2026

### Componentes Implementados:
- ✅ Schemas: `payroll`, `fx` en PostgreSQL
- ✅ Modelos Prisma con multiSchema
- ✅ Engine básico: `computeEmployerCost`, `simulatePayslip`
- ✅ API REST: `/costing/compute`, `/simulator/compute`, `/parameters`
- ✅ UI básica: Dashboard, Simulador, Parámetros
- ✅ Versionado de parámetros legales
- ✅ Snapshots inmutables
- ✅ Separación FX (UF/UTM)

### Parámetros Legales Implementados:
- ✅ AFP (10% + comisión por AFP)
- ✅ SIS (1.54% empleador)
- ✅ Salud (Fonasa 7% / Isapre)
- ✅ AFC (desglosado CIC + FCS)
- ✅ Topes 2026 (89.9 UF / 135.1 UF)
- ✅ Impuesto Único (8 tramos SII)
- ✅ Mutual básico (0.95% default)

### Limitaciones Actuales:
- ⚠️ Gratificación: Calculada pero no visible en parámetros
- ⚠️ Asignación Familiar: NO implementada
- ⚠️ Horas Extra: Estructura básica, sin validaciones
- ⚠️ Días trabajados/ausencias: NO implementado
- ⚠️ Descuentos voluntarios: NO implementados
- ⚠️ APV: NO implementado
- ⚠️ Pensión alimenticia: NO implementada

---

## 🔄 FASE 2: COMPLETITUD LEGAL (REQUERIDO PARA PRODUCCIÓN)

**Estado**: En diseño
**Prioridad**: ALTA
**Fecha estimada**: Q1 2026

### 2.1. Parámetros Faltantes (CRÍTICOS)

#### A) Mutual/Ley 16.744 (Accidentes del Trabajo)
**Estado actual**: Solo tasa default 0.95%
**Debe incluir**:
- ✅ Tasa base legal: 0.93%
- ❌ Tasa adicional: 0% - 3.4% (según siniestralidad empresa)
- ❌ Tasa específica industria seguridad: ~1.2%
- ❌ Estructura: `base_rate + additional_rate + extra_rate`

**Implementación**:
```json
"work_injury": {
  "base_rate": 0.0093,
  "additional_rate_default": 0.0002,
  "employer_rate_default": 0.0095,
  "risk_levels": {
    "low": 0.0093,
    "medium": 0.0095,
    "high": 0.0134,
    "security_industry": 0.0120
  }
}
```

#### B) Asignación Familiar
**Estado actual**: NO implementada
**Debe incluir**:
- ❌ Tramos por ingreso
- ❌ Monto por carga
- ❌ Asignación maternal
- ❌ Asignación invalidez

**Tabla vigente 2026** (aproximada):

| Tramo Ingreso | Por Carga | Maternal | Invalidez |
|---------------|-----------|----------|-----------|
| $0 - $432k | $16,132 | $12,661 | $64,525 |
| $432k - $631k | $10,115 | $7,939 | $64,525 |
| $631k - $982k | $3,189 | $2,506 | $64,525 |
| $982k+ | $0 | $0 | $64,525 |

**Características**:
- NO imponible
- NO tributable
- Pagado por el Estado (reembolsado al empleador)

#### C) Gratificación Legal (COMPLETAR)
**Estado actual**: Básico
**Debe incluir**:
- ❌ Régimen 25% mensual (tope 4.75 IMM)
- ❌ Régimen 30% anual utilidades
- ❌ Flags de imponibilidad
- ❌ Cálculo de tope anual vs mensual

#### D) APV (Ahorro Previsional Voluntario)
**Estado actual**: NO implementado
**Debe incluir**:
- ❌ Descuento voluntario
- ❌ Rebaja base tributable (antes de impuesto)
- ❌ Tope UF 600 anuales

**Importante**: APV se descuenta ANTES del impuesto (reduce base tributable).

#### E) IMM (Ingreso Mínimo Mensual)
**Estado actual**: Hardcodeado $500,000
**Debe incluir**:
- ❌ Tabla versionada de IMM
- ❌ Fecha vigencia
- ❌ Usado para tope gratificación y tramos asignación familiar

---

### 2.2. Conceptos de Liquidación (Catálogo)

**Estado actual**: Tabla `salary_components_catalog` vacía
**Debe poblar**:
- ❌ 20+ conceptos estándar con flags de imponibilidad
- ❌ Haberes imponibles (sueldo, gratificación, HE, comisiones)
- ❌ Haberes no imponibles (colación, movilización, asignación familiar)
- ❌ Descuentos legales (AFP, Salud, AFC, Impuesto)
- ❌ Descuentos voluntarios (APV, préstamos, anticipos)

---

### 2.3. Días Trabajados y Ausencias

**Estado actual**: Solo proporcional básico
**Debe incluir**:
- ❌ Licencias médicas (no descuenta, subsidiado)
- ❌ Permisos sin goce (descuenta proporcional)
- ❌ Vacaciones (no descuenta)
- ❌ Inasistencias (descuenta proporcional)
- ❌ Cálculo de días hábiles vs corridos

---

### 2.4. Horas Extraordinarias (Estructura Completa)

**Estado actual**: Solo recargo 50%
**Debe incluir**:
- ❌ HE 50% (días hábiles)
- ❌ HE 100% (domingos y festivos)
- ❌ Validación límites (2 hrs/día, 12 hrs/semana)
- ❌ Cálculo valor hora (sueldo/30/8)
- ❌ Imponibilidad correcta

---

### 2.5. Descuentos Judiciales

**Estado actual**: NO implementados
**Debe incluir**:
- ❌ Pensión alimenticia (% o monto fijo)
- ❌ Embargo judicial
- ❌ Retención judicial
- ❌ Prioridad de descuentos (ley de prelación)

---

## 🚀 FASE 3: PAYROLL REAL (GARD OPS)

**Estado**: Planificado
**Prioridad**: MEDIA
**Dependencias**: Fase 2 completa

### 3.1. Integración con Asistencia
- ❌ Importar días trabajados reales
- ❌ Sincronizar licencias médicas
- ❌ Importar horas extra autorizadas
- ❌ Calcular automático gratificación anual

### 3.2. Libro de Remuneraciones
- ❌ Generación libro mensual
- ❌ Formato F1887 (Previred)
- ❌ Export a planilla electrónica

### 3.3. Certificados Oficiales
- ❌ PDF liquidación oficial
- ❌ Certificado de sueldo
- ❌ Finiquito electrónico

### 3.4. Integraciones
- ❌ Previred (declaración automática)
- ❌ AFP (certificados)
- ❌ Isapres (declaración)

---

## 📊 PRIORIZACIÓN RECOMENDADA

### 🔴 CRÍTICO (implementar YA si va a producción)
1. **Mutual completa** (Ley 16.744)
2. **Asignación Familiar** (tramos + montos)
3. **Flags de imponibilidad** en todos los conceptos
4. **APV** (descuenta base tributable)
5. **Gratificación estructurada** (2 regímenes)

### 🟡 IMPORTANTE (implementar antes de Q2)
6. **Días trabajados/ausencias**
7. **Horas extra validadas**
8. **Descuentos judiciales**
9. **IMM versionado**

### 🟢 DESEABLE (roadmap futuro)
10. **Integración asistencia**
11. **Libro remuneraciones**
12. **Certificados PDF**
13. **Previred automático**

---

## 🛠️ PLAN DE ACCIÓN INMEDIATO

### Semana 1-2: Completar Parámetros Legales
- [ ] Mutual completa (base + adicional + industria)
- [ ] Asignación Familiar (4 tramos vigentes)
- [ ] Gratificación estructurada
- [ ] APV con rebaja tributaria

### Semana 3: Conceptos y Flags
- [ ] Poblar `salary_components_catalog`
- [ ] Agregar flags a todos los conceptos
- [ ] Actualizar engine para respetar flags

### Semana 4: Testing y Validación
- [ ] Casos de prueba vs simulador profesional
- [ ] Validar con contador/experto previsional
- [ ] Documentar diferencias (si las hay)

---

## 📚 REFERENCIAS TÉCNICAS

### Fuentes Oficiales:
- **AFP**: https://www.spensiones.cl
- **AFC**: https://www.afc.cl
- **SII**: https://www.sii.cl (impuestos)
- **Previred**: https://www.previred.com (indicadores)
- **IPS**: https://www.ips.gob.cl (asignación familiar)
- **Mutuales**: ACHS, IST, MUSEG, ISL

### Calculadoras de Referencia:
- https://www.calcular.cl/como-calcular-sueldo-liquido-chile.html
- https://calculadorasueldoliquido.cl/
- https://www.previred.com/simuladores/

---

## 🎯 CRITERIO DE ÉXITO

El módulo estará "audit-ready" cuando:
1. ✅ Resultados coincidan 100% con simuladores oficiales
2. ✅ Todos los conceptos tengan flags de imponibilidad
3. ✅ Soporte completo para casos edge (ausencias, HE, judicial)
4. ✅ Validado por contador o experto previsional
5. ✅ Documentación completa de fórmulas y referencias legales

---

**Última actualización**: 7 Febrero 2026
**Responsable**: Sistema OPAI
**Versión**: 1.1.0 (base + roadmap)
