CREATE TABLE external_meta_coverage (
  provider TEXT NOT NULL,
  patch_date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  maps JSONB NOT NULL,
  PRIMARY KEY (provider, patch_date)
);
