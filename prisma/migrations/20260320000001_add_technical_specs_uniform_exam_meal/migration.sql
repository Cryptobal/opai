-- Add technical_specs to cpq.quote_uniform_items
ALTER TABLE cpq.quote_uniform_items ADD COLUMN IF NOT EXISTS technical_specs TEXT;

-- Add technical_specs to cpq.quote_exam_items
ALTER TABLE cpq.quote_exam_items ADD COLUMN IF NOT EXISTS technical_specs TEXT;

-- Add technical_specs to cpq.quote_meals
ALTER TABLE cpq.quote_meals ADD COLUMN IF NOT EXISTS technical_specs TEXT;
