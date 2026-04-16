# Sample formats — Payroll CSVs

This directory contains **anonymized** sample CSVs that document the exact format
expected by the payroll parsers and exporters in `src/lib/payroll/`.

**All data here is fake** — RUTs are placeholders (`11111111-1`, `22222222-2`,
`33333333-3`), names are generic ("Juan Ejemplo Demo", "Maria Demo Sample",
"Pedro Test Ficticio"), salaries are rounded numbers. No real person, RUT, or
financial figure appears in any file.

## Files

| File | Used by |
|------|---------|
| `asistencias-cr-sample.csv` | `src/lib/payroll/parsers/cr-attendance-parser.ts` |
| `libro-remuneraciones-sample.csv` | `src/lib/payroll/exporters/libro-remuneraciones-exporter.ts` |
| `libro-imposiciones-sample.csv` | `src/lib/payroll/exporters/previred-exporter.ts` |
| `f30-imposiciones-sample.csv` | (reference for F30 Previred format) |

## Real production data

Real CSVs with PII are stored in private storage (R2 / Drive — see
`docs/01-architecture/data-sources.md`). They MUST NOT be committed to the repo
under any circumstance. The `.gitignore` blocks `Datos Ops/` and `/private-data/`
at the root level to prevent accidental commits.
