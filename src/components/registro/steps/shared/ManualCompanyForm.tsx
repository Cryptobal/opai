'use client';

// Lista mínima de regiones+comunas comunes en CL (no exhaustiva — usuario
// puede tipear "Otra" y escribir libre). Mantenida corta a propósito para
// no inflar el bundle del wizard.
const COMUNAS_POR_CIUDAD: Record<string, string[]> = {
  'Santiago': [
    'Santiago Centro', 'Providencia', 'Las Condes', 'Vitacura', 'Lo Barnechea',
    'Ñuñoa', 'La Reina', 'Macul', 'Peñalolén', 'La Florida', 'Puente Alto',
    'San Bernardo', 'Maipú', 'Pudahuel', 'Quilicura', 'Huechuraba',
    'Recoleta', 'Independencia', 'Conchalí', 'Renca', 'Cerro Navia',
    'Estación Central', 'Quinta Normal', 'San Miguel', 'San Joaquín',
  ],
  'Valparaíso': ['Valparaíso', 'Viña del Mar', 'Concón', 'Quilpué', 'Villa Alemana'],
  'Concepción': ['Concepción', 'Talcahuano', 'San Pedro de la Paz', 'Chiguayante', 'Hualpén'],
  'La Serena': ['La Serena', 'Coquimbo', 'Ovalle'],
  'Antofagasta': ['Antofagasta', 'Calama', 'Mejillones'],
  'Temuco': ['Temuco', 'Padre Las Casas', 'Villarrica', 'Pucón'],
  'Puerto Montt': ['Puerto Montt', 'Puerto Varas', 'Osorno'],
  'Otra': [],
};

interface ManualCompanyFormProps {
  values: {
    legalName: string;
    address: string;
    commune: string;
    city: string;
    giro: string;
  };
  onChange: (field: keyof ManualCompanyFormProps['values'], value: string) => void;
  errors?: Partial<Record<keyof ManualCompanyFormProps['values'], string>>;
}

export function ManualCompanyForm({ values, onChange, errors }: ManualCompanyFormProps) {
  const ciudades = Object.keys(COMUNAS_POR_CIUDAD);
  const comunasDisponibles = COMUNAS_POR_CIUDAD[values.city] ?? [];

  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 12, color: 'var(--mk-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Completa los datos de tu empresa manualmente. Después podrás corregirlos desde Configuración.
      </p>

      <div className="registro-field">
        <label htmlFor="legalName">Razón social</label>
        <input
          id="legalName"
          type="text"
          value={values.legalName}
          onChange={(e) => onChange('legalName', e.target.value)}
          placeholder="Ej. Servicios de Seguridad Antártica SpA"
          maxLength={200}
          className={errors?.legalName ? 'error' : ''}
        />
        {errors?.legalName && <span className="registro-field-error">{errors.legalName}</span>}
      </div>

      <div className="registro-field">
        <label htmlFor="giro">Giro / Actividad</label>
        <input
          id="giro"
          type="text"
          value={values.giro}
          onChange={(e) => onChange('giro', e.target.value)}
          placeholder="Ej. Servicios de seguridad y vigilancia"
          maxLength={300}
          className={errors?.giro ? 'error' : ''}
        />
        {errors?.giro && <span className="registro-field-error">{errors.giro}</span>}
      </div>

      <div className="registro-field">
        <label htmlFor="address">Dirección</label>
        <input
          id="address"
          type="text"
          value={values.address}
          onChange={(e) => onChange('address', e.target.value)}
          placeholder="Calle, número, oficina"
          maxLength={300}
          className={errors?.address ? 'error' : ''}
        />
        {errors?.address && <span className="registro-field-error">{errors.address}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="registro-field">
          <label htmlFor="city">Ciudad</label>
          <select
            id="city"
            value={values.city}
            onChange={(e) => {
              onChange('city', e.target.value);
              onChange('commune', '');
            }}
            className={errors?.city ? 'error' : ''}
          >
            <option value="">Selecciona…</option>
            {ciudades.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {errors?.city && <span className="registro-field-error">{errors.city}</span>}
        </div>

        <div className="registro-field">
          <label htmlFor="commune">Comuna</label>
          {comunasDisponibles.length > 0 ? (
            <select
              id="commune"
              value={values.commune}
              onChange={(e) => onChange('commune', e.target.value)}
              className={errors?.commune ? 'error' : ''}
            >
              <option value="">Selecciona…</option>
              {comunasDisponibles.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <input
              id="commune"
              type="text"
              value={values.commune}
              onChange={(e) => onChange('commune', e.target.value)}
              placeholder="Ej. Las Condes"
              maxLength={100}
              className={errors?.commune ? 'error' : ''}
            />
          )}
          {errors?.commune && <span className="registro-field-error">{errors.commune}</span>}
        </div>
      </div>
    </div>
  );
}
