# Migración Soho CRM → Opai

## Uso

```bash
npm run migrate:soho
```

O con tenant personalizado:

```bash
TENANT_ID=gard npm run migrate:soho
```

## Requisitos

1. **Ejecutar migraciones** antes:

   ```bash
   npx prisma migrate deploy
   ```

2. **CSV en** `Datos CRM/`:
   - `Empresas_2026_02_09.csv`
   - `Contactos_2026_02_09.csv`
   - `Negocios_2026_02_09.csv`

## Qué hace

- **Empresas** → `crm.accounts` (con legalName, legalRepresentativeName, legalRepresentativeRut)
- **Contactos** con empresa → `crm.contacts` (se omiten los sin empresa)
- **Negocios** desduplicados → `crm.deals` (con proposalLink, dealType, notes, etc.)

## Nota

Ejecutar solo una vez. Si ya hay datos migrados, hacerlo de nuevo creará duplicados. Para reimportar, borrar antes cuentas/contactos/negocios del tenant.
