ALTER TABLE update_log ADD COLUMN origin VARCHAR(12)
  CHECK (origin IN ('manual', 'scheduled'));
