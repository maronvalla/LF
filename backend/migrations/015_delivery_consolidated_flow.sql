BEGIN;

ALTER TABLE delivery_consolidated_controls
ADD COLUMN IF NOT EXISTS checklist_json JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS pick_plan_json JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
