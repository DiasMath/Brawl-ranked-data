-- The reset date is November 19. Midnight UTC is a provisional reporting cut,
-- not a confirmed maintenance time. Keep the estimate visible until corrected.
UPDATE ranked_seasons SET starts_at = '2026-11-19 00:00:00'
WHERE id = 'ranked-2026-11' AND date_only AND starts_at = '2026-11-20 00:00:00';

CREATE TABLE ranked_season_changes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  season_id TEXT NOT NULL REFERENCES ranked_seasons(id),
  previous_value JSONB NOT NULL,
  next_value JSONB NOT NULL
);
