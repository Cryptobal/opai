# Data sources — private storage

This document tracks where operational data (PII, financials, payroll) is stored
**outside the code repository**, as required by Ley 21.719 (Chilean data
protection law) and operational hygiene.

## Payroll & operations source CSVs

Historical and ongoing operational CSVs (libros de remuneraciones, imposiciones,
asistencias, F30) are stored in:

**Location:** `<TODO: pegar URL/path de R2 o Drive>`
**Access:** restricted to `<TODO: lista de personas con acceso>`
**Backup:** `<TODO: política de backup>`

For format reference (anonymized samples), see:
`docs/02-implementation/payroll/sample-formats/`

## Adding new operational data

1. NEVER commit raw CSVs with real PII to the repo.
2. Upload to private storage with appropriate access controls.
3. If a sample is needed for code documentation, add an anonymized version
   under `docs/02-implementation/payroll/sample-formats/`.
4. Update this file with the new data location.
