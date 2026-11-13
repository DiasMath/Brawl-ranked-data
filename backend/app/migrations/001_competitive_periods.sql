CREATE TABLE ranked_seasons (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  starts_at TIMESTAMP(3) NOT NULL,
  ends_at TIMESTAMP(3) NOT NULL CHECK (ends_at > starts_at),
  source_url TEXT NOT NULL,
  date_only BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE ranked_patches (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  earliest_at TIMESTAMP(3) NOT NULL UNIQUE,
  latest_at TIMESTAMP(3) NOT NULL CHECK (latest_at >= earliest_at),
  source_url TEXT NOT NULL,
  CHECK (latest_at <= earliest_at + INTERVAL '2 days')
);

-- Use the first full UTC day inside the reported ranked season while reset times are unknown.
INSERT INTO ranked_seasons (id,label,starts_at,ends_at,source_url,date_only) VALUES (
  'ranked-2026-10', 'Ranqueada de outubro–novembro', '2026-10-16 00:00:00', '2026-11-19 00:00:00',
  'https://lfcarry.com/guides/brawl-stars-ranks', TRUE
);

-- A calendar day provides a transition window when the precise release time is unknown.
INSERT INTO ranked_patches (id,label,earliest_at,latest_at,source_url) VALUES
  ('2026-11-03', 'Atualização de 03/11', '2026-11-03 00:00:00', '2026-11-04 00:00:00',
   'https://timesaver.gg/blog/brawl-stars-balance-changes'),
  ('2026-11-11', 'Balanceamento de 11/11', '2026-11-11 00:00:00', '2026-11-12 00:00:00',
   'https://supercell.com/brawlstars/en/blog/game-updates/release-notes-november-2026/');

CREATE TABLE meta_collection_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finished_at TIMESTAMP(3) NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('manual', 'scheduled')),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'production')),
  profile_requests INT NOT NULL CHECK (profile_requests >= 0),
  battlelog_requests INT NOT NULL CHECK (battlelog_requests >= 0),
  ranking_requests INT NOT NULL CHECK (ranking_requests >= 0),
  unique_received INT NOT NULL CHECK (unique_received >= 0),
  added INT NOT NULL CHECK (added BETWEEN 0 AND unique_received),
  status TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'error'))
);
CREATE INDEX meta_collection_runs_time ON meta_collection_runs (finished_at DESC);
