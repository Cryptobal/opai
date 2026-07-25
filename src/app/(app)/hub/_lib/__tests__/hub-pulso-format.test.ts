import { describe, expect, it } from 'vitest';
import {
  cajaVariant,
  cajaIsStale,
  porCobrarVariant,
  ufNegociandoVariant,
  facturadoVariant,
  coberturaVariant,
  coberturaThreshold,
} from '../hub-pulso-format';

describe('cajaVariant — el signo manda, no la decoración', () => {
  it('saldo positivo → ok', () => {
    expect(cajaVariant(11_000_000)).toBe('ok');
  });

  it('saldo negativo → danger (nunca verde)', () => {
    // Regresión del bug: -$11M se pintaba en verde.
    expect(cajaVariant(-11_000_000)).toBe('danger');
  });

  it('saldo exactamente cero → default (estado vacío neutro)', () => {
    expect(cajaVariant(0)).toBe('default');
  });
});

describe('cajaIsStale — la antigüedad es un aviso separado del color', () => {
  it('dato fresco (≤7d) no es stale', () => {
    expect(cajaIsStale(0)).toBe(false);
    expect(cajaIsStale(7)).toBe(false);
  });

  it('dato antiguo (>7d) es stale', () => {
    expect(cajaIsStale(8)).toBe(true);
    expect(cajaIsStale(999)).toBe(true);
  });

  it('caja negativa Y dato antiguo: prevalece la alerta por signo', () => {
    // El color lo decide el signo; la antigüedad solo activa el aviso.
    expect(cajaVariant(-5_000_000)).toBe('danger');
    expect(cajaIsStale(30)).toBe(true);
  });
});

describe('porCobrarVariant — total neutro; el vencido va en su chip', () => {
  it('sin umbral definido → siempre neutro (default)', () => {
    expect(porCobrarVariant(0)).toBe('default');
    expect(porCobrarVariant(50_000_000)).toBe('default');
  });

  it('con umbral, escala a danger solo si el vencido lo supera', () => {
    expect(porCobrarVariant(10_000_000, 20_000_000)).toBe('default');
    expect(porCobrarVariant(30_000_000, 20_000_000)).toBe('danger');
  });
});

describe('ufNegociandoVariant — cero no es un resultado positivo', () => {
  it('UF 0 → default (estado vacío neutro, nunca verde)', () => {
    expect(ufNegociandoVariant(0)).toBe('default');
  });

  it('UF > 0 → brand', () => {
    expect(ufNegociandoVariant(1200)).toBe('brand');
  });
});

describe('facturadoVariant', () => {
  it('con dato presente → ok', () => {
    expect(facturadoVariant()).toBe('ok');
  });
});

describe('coberturaVariant / coberturaThreshold — umbrales sin cambios', () => {
  it('≥95 → ok', () => {
    expect(coberturaVariant(95)).toBe('ok');
    expect(coberturaVariant(100)).toBe('ok');
    expect(coberturaThreshold(95)).toBe('ok');
  });

  it('≥80 y <95 → warn', () => {
    expect(coberturaVariant(80)).toBe('warn');
    expect(coberturaVariant(94)).toBe('warn');
    expect(coberturaThreshold(80)).toBe('warn');
  });

  it('<80 → danger', () => {
    expect(coberturaVariant(79)).toBe('danger');
    expect(coberturaVariant(0)).toBe('danger');
    expect(coberturaThreshold(50)).toBe('danger');
  });
});
