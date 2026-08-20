-- Director (y variantes) son sueldo sensible por regla de negocio.
-- El flag vive en el cargo CPQ, no en la ficha.
UPDATE "cpq"."cargos"
SET "salary_sensitive" = true,
    "updated_at" = NOW()
WHERE "salary_sensitive" = false
  AND (
    name ~* '(^|[^[:alpha:]])director(a|es|as)?([^[:alpha:]]|$)'
    OR name ~* '(^|[^[:alpha:]])subdirectora?s?([^[:alpha:]]|$)'
  );
