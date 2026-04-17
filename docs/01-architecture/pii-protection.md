# PII Protection Policy

This repo enforces a 3-layer defense against accidentally committing PII
(RUTs, salaries, names of real people, F30 forms, payroll books, etc.).

## Layer 1: `.gitignore`

Blocks common PII filename patterns at the git tracking level. See the
"Data files con PII potencial" section in `.gitignore`.

## Layer 2: pre-commit hook (Husky)

Before every commit, `scripts/check-pii.mjs` scans staged files for:
- Real Chilean RUTs (excluding placeholders like `11111111-1`)
- Blocks of 16+ consecutive digits (possible card numbers)
- Suspicious filenames (libros de remuneración, Previred files, etc.)

If anything is detected, the commit is **blocked** with a clear message
on how to proceed.

The hook is installed automatically via the `prepare` script in
`package.json` when anyone runs `npm install`.

## Layer 3: GitHub Actions CI

`.github/workflows/pii-check.yml` runs the same scanner against every PR.
Catches anything that bypassed the local hook (e.g., `--no-verify`,
working from a machine without Husky).

## Where to put sample data

If you need a sample CSV or document for format documentation, put it in:
`docs/02-implementation/payroll/sample-formats/`

This path is **allowlisted** by the scanner. Use only fake data:
- RUTs: `11111111-1`, `22222222-2`, etc.
- Names: "Juan Ejemplo", "María Demo"
- Salaries: rounded numbers like 100.000

## What to do if PII slipped through

If you discover real PII in a commit:
1. Remove the file in a new commit (`git rm`)
2. Add it to `.gitignore`
3. **The data is still in git history.** For full removal, requires a
   coordinated `git filter-repo` + force-push (see `CLEANUP_NOTES.md`
   from PR #257 for context).
