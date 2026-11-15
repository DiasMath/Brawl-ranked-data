ALTER TABLE external_meta_snapshots
  ADD COLUMN rank_scope TEXT NOT NULL DEFAULT 'all' CHECK (rank_scope IN ('all', 'masters')),
  DROP CONSTRAINT external_meta_snapshots_pkey,
  ADD PRIMARY KEY (provider, scope, rank_scope, patch_date);

ALTER TABLE external_meta_coverage
  ADD COLUMN rank_scope TEXT NOT NULL DEFAULT 'all' CHECK (rank_scope IN ('all', 'masters')),
  DROP CONSTRAINT external_meta_coverage_pkey,
  ADD PRIMARY KEY (provider, rank_scope, patch_date);
