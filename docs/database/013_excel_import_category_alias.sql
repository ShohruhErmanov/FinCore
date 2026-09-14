-- FinCore — Excel import reference alignment
-- Adds the exact workbook label for the existing EQUIPMENT_PURCHASE category.
-- No category, expense, budget or historical row is created, changed or deleted.

BEGIN;

INSERT INTO fincore.category_aliases (category_id, alias_text)
SELECT id, 'Texnika sotib olish va yangilash'
FROM fincore.expense_categories
WHERE code = 'EQUIPMENT_PURCHASE'
ON CONFLICT DO NOTHING;

COMMIT;
