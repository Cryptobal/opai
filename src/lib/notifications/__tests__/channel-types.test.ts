import { describe, it, expect } from 'vitest';
import { normalizePrefs, expandCatalogDefaults } from '../channel-types';

describe('normalizePrefs (backwards compat)', () => {
  it('legacy push:true → pushDesktop=true, pushMobile=true', () => {
    const out = normalizePrefs({ bell: true, email: false, push: true });
    expect(out).toEqual({
      bell: true,
      email: false,
      pushDesktop: true,
      pushMobile: true,
    });
  });

  it('legacy push:false → pushDesktop=false, pushMobile=false', () => {
    const out = normalizePrefs({ push: false });
    expect(out).toEqual({ pushDesktop: false, pushMobile: false });
  });

  it('shape nuevo se preserva tal cual', () => {
    const out = normalizePrefs({ pushDesktop: true, pushMobile: false });
    expect(out).toEqual({ pushDesktop: true, pushMobile: false });
  });

  it('shape nuevo gana sobre legacy push', () => {
    const out = normalizePrefs({ push: true, pushDesktop: false, pushMobile: true });
    expect(out).toEqual({ pushDesktop: false, pushMobile: true });
  });

  it('vacío devuelve vacío', () => {
    expect(normalizePrefs(undefined)).toEqual({});
    expect(normalizePrefs({})).toEqual({});
  });
});

describe('expandCatalogDefaults', () => {
  it('replica push del catálogo a ambos canales', () => {
    expect(expandCatalogDefaults({ bell: true, email: false, push: true })).toEqual({
      bell: true,
      email: false,
      pushDesktop: true,
      pushMobile: true,
    });
  });
});
