CREATE TABLE external_ban_snapshots (
    provider TEXT NOT NULL,
    scope TEXT NOT NULL,
    rank_scope TEXT NOT NULL CHECK (rank_scope IN ('masters','all')),
    patch_date DATE NOT NULL,
    period_end DATE NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    payload JSONB NOT NULL,
    PRIMARY KEY (provider, scope, rank_scope, patch_date, period_end)
);

CREATE INDEX external_bans_recent ON external_ban_snapshots
    (provider, scope, rank_scope, patch_date DESC, period_end DESC);
