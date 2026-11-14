ALTER TABLE battle_evidence ADD COLUMN performance JSONB NOT NULL DEFAULT '{}'::jsonb;
