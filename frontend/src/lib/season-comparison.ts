import { normalize, stats } from './data';
import type { RankedSeason } from './data';
import { draftMetaMapKey } from './draftmeta';
import { seriesPerformance } from './match-series';
import type { MatchSeries } from './match-series';

export type SeasonExtent = 'elapsed' | 'volume' | 'all';
export type SeasonDimension = 'brawler' | 'mode' | 'map' | 'brawlerMode';

type Window = RankedSeason & { start: number; end: number };
type Entry = { match: MatchSeries; start: number; last: number; official: string | null; window?: Window };

export function seasonCohorts(matches: MatchSeries[], seasons: RankedSeason[], observedAt: number) {
  const windows = seasons.map(season => ({ ...season, start: Date.parse(season.starts_at), end: Date.parse(season.ends_at) }))
    .filter(season => season.start <= observedAt)
    .sort((a, b) => a.start - b.start);
  const entries: Entry[] = [];
  const officialWindows = new Map<string, string | null>();
  for (const match of matches) {
    if (!match.latest.ranked) continue;
    const start = Date.parse(match.rounds[0]?.played_at ?? match.latest.played_at);
    const last = Date.parse(match.latest.played_at);
    if (!Number.isFinite(start) || !Number.isFinite(last) || last > observedAt) continue;
    const candidates = windows.filter(season => start >= season.start && last < season.end);
    const window = candidates.length === 1 ? candidates[0] : undefined;
    const official = [...new Set(match.rounds.flatMap(round => {
      const id = round.season_source ? '' : normalize(round.season);
      return id ? [id] : [];
    }))];
    if (official.length > 1) continue;
    const id = official[0] ?? null;
    if (id && window) {
      const known = officialWindows.get(id);
      officialWindows.set(id, known === undefined || known === window.id ? window.id : null);
    }
    entries.push({ match, start, last, official: id, window });
  }

  const bySeason = new Map(windows.map(window => [window.id, [] as Entry[]]));
  for (const entry of entries.sort((a, b) => a.start - b.start || a.match.id.localeCompare(b.match.id))) {
    const matched = entry.official ? officialWindows.get(entry.official) : undefined;
    const id = matched === undefined ? entry.window?.id : matched;
    if (id) bySeason.get(id)?.push(entry);
  }
  return { windows, bySeason,
    unassigned: matches.filter(match => match.latest.ranked && Date.parse(match.latest.played_at) <= observedAt).length
      - [...bySeason.values()].reduce((total, rows) => total + rows.length, 0) };
}

export function comparableSeasons(
  cohorts: ReturnType<typeof seasonCohorts>, selected: string, observedAt: number,
  extent: SeasonExtent, allowed: ReadonlySet<string>,
) {
  const index = selected ? cohorts.windows.findIndex(season => season.id === selected) : cohorts.windows.length - 1;
  if (index < 1) return null;
  const current = cohorts.windows[index], previous = cohorts.windows[index - 1];
  const currentRows = cohorts.bySeason.get(current.id) ?? [];
  const previousRows = cohorts.bySeason.get(previous.id) ?? [];
  const elapsed = Math.min(observedAt - current.start, current.end - current.start, previous.end - previous.start);
  const volume = Math.min(currentRows.length, previousRows.length);
  function scope(window: Window, entries: Entry[]) {
    const end = window.start + elapsed;
    const sliced = extent === 'elapsed' ? entries.filter(row => row.start >= window.start && row.last < end)
      : extent === 'volume' ? entries.slice(0, volume) : entries;
    return {
      window, end,
      firstRecorded: entries[0]?.match.rounds[0]?.played_at ?? null,
      matches: sliced.filter(row => allowed.has(row.match.id)).map(row => row.match),
    };
  }
  return { current: scope(current, currentRows), previous: scope(previous, previousRows), volume };
}

export const playerPick = (match: MatchSeries) => match.latest.player_brawler
  ?? match.rounds.findLast(round => round.player_brawler)?.player_brawler ?? null;

type Group = { id: string; brawler: string | null; mode: string | null; map: string | null; matches: MatchSeries[] };

function groupMatches(matches: MatchSeries[], dimension: SeasonDimension) {
  const groups = new Map<string, Group>();
  const pickedByMode = new Map<string, number>();
  let picked = 0;
  for (const match of matches) {
    const brawler = playerPick(match);
    const { mode, map_name } = match.latest;
    if (brawler) {
      picked++;
      const key = normalize(mode);
      pickedByMode.set(key, (pickedByMode.get(key) ?? 0) + 1);
    }
    const fields = {
      brawler: [normalize(brawler)], mode: [normalize(mode)],
      map: [draftMetaMapKey(map_name ?? '')], brawlerMode: [normalize(brawler), normalize(mode)],
    }[dimension];
    if (fields.some(field => !field)) continue;
    const id = JSON.stringify(fields);
    const group = groups.get(id);
    if (group) group.matches.push(match);
    else groups.set(id, { id, brawler, mode, map: map_name, matches: [match] });
  }
  return { groups, picked, pickedByMode };
}

export function comparisonRows(current: MatchSeries[], previous: MatchSeries[], dimension: SeasonDimension) {
  const now = groupMatches(current, dimension), before = groupMatches(previous, dimension);
  return [...new Set([...now.groups.keys(), ...before.groups.keys()])].map(id => {
    const left = now.groups.get(id), right = before.groups.get(id);
    const row = (left ?? right)!;
    const current = stats(left?.matches ?? []), previous = stats(right?.matches ?? []);
    const pickRate = (cohort: typeof now, games: number) => {
      if (dimension !== 'brawler' && dimension !== 'brawlerMode') return null;
      const total = dimension === 'brawler' ? cohort.picked : cohort.pickedByMode.get(normalize(row.mode));
      return total ? games / total : null;
    };
    return {
      id, brawler: row.brawler, mode: row.mode, map: row.map, current, previous,
      winChange: difference(current.rate, previous.rate),
      currentPick: pickRate(now, current.games), previousPick: pickRate(before, previous.games),
    };
  }).sort((a, b) => b.current.games + b.previous.games - a.current.games - a.previous.games ||
    a.id.localeCompare(b.id, 'pt-BR'));
}

export const difference = (current: number | null, previous: number | null) =>
  current === null || previous === null ? null : current - previous;

export function seasonSummary(matches: MatchSeries[]) {
  const { comebackRate, comebacks, lostOpening } = seriesPerformance(matches);
  return { ...stats(matches), comebackRate, comebacks, lostOpening };
}
