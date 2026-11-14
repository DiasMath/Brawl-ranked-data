import { draftStats, groupStats, normalize } from './data';
import type { Battle } from './data';

type Scope = { start: string; end: string; fetched_at: string; map: string | null };

export function mapKey(value: string | null) {
  return normalize(value).replace(/[’‘]/g,"'");
}

export function accountInExternalScope(matches: Battle[], scope: Scope) {
  const start = Date.parse(`${scope.start}T00:00:00Z`);
  const end = Date.parse(`${scope.end}T00:00:00Z`) + 86_400_000;
  const fetched = Date.parse(scope.fetched_at);
  if (![start, end, fetched].every(Number.isFinite) || start >= end || fetched < start) return [];
  return matches.filter(match => {
    const played = Date.parse(match.played_at);
    return match.ranked && played >= start && played < end && played <= fetched &&
      (!scope.map || mapKey(match.map_name) === mapKey(scope.map));
  });
}

export function accountBrawlerRows(matches: Battle[]) {
  return new Map(groupStats(matches, match => [match.player_brawler]).map(row => [normalize(row.label), row]));
}

export function observedBans(matches: Battle[]) {
  const { drafts, rows } = draftStats(matches.filter(match=>!match.bans_source));
  return {
    total: matches.length, known: drafts,
    rows: rows.filter(row => row.bans > 0)
      .sort((a,b) => b.bans - a.bans || a.label.localeCompare(b.label, 'pt-BR')),
  };
}
