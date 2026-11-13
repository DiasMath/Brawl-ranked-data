CREATE TABLE external_meta_snapshots (
  provider TEXT NOT NULL,
  scope TEXT NOT NULL,
  patch_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  payload JSONB NOT NULL,
  PRIMARY KEY (provider, scope, patch_date)
);
CREATE INDEX external_meta_recent ON external_meta_snapshots (provider, scope, fetched_at DESC);
