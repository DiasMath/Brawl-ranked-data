-- The reported reset dates are November 19 and the third Thursday of December (December 17).
-- Keep both reset days outside the inferred UTC window until an exact reset time is verified.
INSERT INTO ranked_seasons (id, label, starts_at, ends_at, source_url, date_only)
VALUES ('ranked-2026-11', 'Ranqueada de novembro–dezembro', '2026-11-20 00:00:00',
        '2026-12-17 00:00:00', 'https://lfcarry.com/guides/brawl-stars-ranks', TRUE);
