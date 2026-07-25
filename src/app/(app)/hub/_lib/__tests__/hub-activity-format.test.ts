import { describe, expect, it } from 'vitest';
import {
  humanizeActivity,
  formatActor,
  DOMAIN_TONE,
} from '../hub-activity-format';

describe('formatActor — nombre visible, sin exponer el correo', () => {
  it('deriva "Alberto Stein" desde el handle', () => {
    expect(formatActor('alberto.stein@gard.cl')).toBe('Alberto Stein');
  });
  it('soporta guiones y guiones bajos', () => {
    expect(formatActor('maria_jose-perez@x.cl')).toBe('Maria Jose Perez');
  });
  it('sin correo → Sistema', () => {
    expect(formatActor(null)).toBe('Sistema');
    expect(formatActor('')).toBe('Sistema');
  });
});

describe('humanizeActivity — claves de dominio', () => {
  it('personas.guardia.document.created x9 → frase legible en plural', () => {
    const h = humanizeActivity({
      action: 'personas.guardia.document.created',
      entity: 'OpsGuardia',
      count: 9,
      userEmail: 'alberto.stein@gard.cl',
    });
    expect(h.actor).toBe('Alberto Stein');
    expect(h.phrase).toBe('subió 9 documentos de guardias');
    expect(h.domain).toBe('personas');
    expect(h.tone).toBe('emerald');
    expect(h.countEmbedded).toBe(true);
  });

  it('conteo 1 concuerda en singular', () => {
    const h = humanizeActivity({
      action: 'personas.guardia.document.created',
      entity: 'OpsGuardia',
      count: 1,
      userEmail: 'alberto.stein@gard.cl',
    });
    expect(h.phrase).toBe('subió un documento de guardias');
    expect(h.countEmbedded).toBe(false);
  });

  it('personas.guardia.lifecycle.updated x5 → estado de guardias', () => {
    const h = humanizeActivity({
      action: 'personas.guardia.lifecycle.updated',
      entity: 'OpsGuardia',
      count: 5,
      userEmail: 'alberto.stein@gard.cl',
    });
    expect(h.phrase).toBe('actualizó 5 estados de guardias');
    expect(h.domain).toBe('personas');
  });

  it('ops.marcacion.modified → operaciones (sky)', () => {
    const h = humanizeActivity({
      action: 'ops.marcacion.modified',
      entity: 'OpsAsistenciaDiaria',
      count: 1,
      userEmail: 'sup@x.cl',
    });
    expect(h.phrase).toBe('modificó una marcación');
    expect(h.domain).toBe('operaciones');
    expect(h.tone).toBe('sky');
  });

  it('ops.marcacion.opposed → verbo compuesto legible', () => {
    const h = humanizeActivity({
      action: 'ops.marcacion.opposed',
      entity: 'OpsAsistenciaDiaria',
      count: 2,
      userEmail: null,
    });
    expect(h.phrase).toBe('registró oposición en 2 marcaciones');
    expect(h.actor).toBe('Sistema');
  });

  it('verbo compuesto te_created → turno extra', () => {
    const h = humanizeActivity({
      action: 'personas.guardia.te_created',
      entity: 'OpsGuardia',
      count: 1,
      userEmail: 'x@y.cl',
    });
    expect(h.phrase).toContain('turno extra');
    expect(h.phrase).not.toContain('te_created');
  });
});

describe('humanizeActivity — verbos simples', () => {
  it('create + CrmDeal → creó un negocio (comercial)', () => {
    const h = humanizeActivity({
      action: 'create',
      entity: 'CrmDeal',
      count: 1,
      userEmail: 'ana@x.cl',
    });
    expect(h.phrase).toBe('creó un negocio');
    expect(h.domain).toBe('comercial');
    expect(h.tone).toBe('violet');
  });

  it('login → inició sesión', () => {
    const h = humanizeActivity({
      action: 'login',
      entity: 'User',
      count: 3,
      userEmail: 'ana@x.cl',
    });
    expect(h.phrase).toBe('inició sesión');
    // acción sin objeto contable → la cantidad se muestra aparte
    expect(h.countEmbedded).toBe(false);
  });

  it('user.role_changed → frase completa conocida', () => {
    const h = humanizeActivity({
      action: 'user.role_changed',
      entity: 'User',
      count: 1,
      userEmail: 'admin@x.cl',
    });
    expect(h.phrase).toBe('cambió el rol de un usuario');
    expect(h.domain).toBe('sistema');
  });
});

describe('humanizeActivity — fallback nunca expone la clave cruda', () => {
  it('clave totalmente desconocida → descripción genérica del dominio', () => {
    const h = humanizeActivity({
      action: 'wibble.wobble.frobnicated',
      entity: 'Xyzzy',
      count: 2,
      userEmail: 'x@y.cl',
    });
    expect(h.phrase).not.toContain('wibble');
    expect(h.phrase).not.toContain('frobnicated');
    expect(h.phrase).not.toContain('.');
    expect(h.phrase).not.toContain('undefined');
    expect(h.phrase.length).toBeGreaterThan(0);
  });

  it('verbo desconocido pero objeto conocido → deriva desde segmentos', () => {
    const h = humanizeActivity({
      action: 'personas.guardia.document.frobnicated',
      entity: 'OpsGuardia',
      count: 3,
      userEmail: 'x@y.cl',
    });
    expect(h.phrase).toContain('documentos de guardias');
    expect(h.phrase).not.toContain('frobnicated');
  });

  it('acción vacía no rompe ni expone "undefined"', () => {
    const h = humanizeActivity({
      action: '',
      entity: '',
      count: 1,
      userEmail: null,
    });
    expect(h.phrase).not.toContain('undefined');
    expect(h.phrase.length).toBeGreaterThan(0);
  });
});

describe('DOMAIN_TONE — los seis dominios tienen tinte propio', () => {
  it('cubre los 6 dominios con tonos válidos', () => {
    expect(Object.keys(DOMAIN_TONE)).toHaveLength(6);
    expect(new Set(Object.values(DOMAIN_TONE)).size).toBe(6);
  });
});
