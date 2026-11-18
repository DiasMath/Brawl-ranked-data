import { normalize } from './data';
import type { Battle, Dataset } from './data';
import type { Progress } from './browser-store';

export function seasonLabel(value: string | null | undefined) {
  const label = value?.trim();
  if (!label) return null;
  const number = /^(?:(?:ranked season|season|temporada)\s+)?#?(\d+)$/i.exec(label)?.[1];
  return number ? `Temporada ${number}` : label;
}

export function rankedSeasonIndex(data: Dataset, readings: readonly Progress[]) {
  const calendar = (data.ranked_seasons ?? []).map(window => ({
    ...window, start: Date.parse(window.starts_at), end: Date.parse(window.ends_at),
  }));
  const identity = (value:string) => normalize(seasonLabel(value)?.replace(/ \(prevista\)$/i, ''));
  function windowAt(at: string) {
    const time = Date.parse(at);
    const candidates = calendar.filter(window => time >= window.start && time < window.end);
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  const aliases = new Map<string, string | null>();
  const officialByWindow = new Map<string, Set<string>>();
  function observe(at: string, season: string | null | undefined) {
    const key = normalize(seasonLabel(season));
    if (!key) return;
    const window = windowAt(at);
    if (!window) return;
    // An official season on a provisional reset day must retain its own identity.
    if (identity(window.label) !== key) return;
    const official = officialByWindow.get(window.id) ?? new Set<string>();
    official.add(key);
    officialByWindow.set(window.id, official);
    const existing = aliases.get(key);
    aliases.set(key, existing === undefined || existing === window.id ? window.id : null);
  }
  for (const match of data.matches) {
    if (match.ranked && !match.season_source) observe(match.played_at, match.season);
  }
  for (const reading of readings) {
    if (reading.method === 'api' && (reading.score !== null || reading.rank)) observe(reading.at, reading.season);
  }
  if (data.profile) observe(data.profile.fetched_at, data.profile.season);

  function displayWindow(window: typeof calendar[number]) {
    const keys = officialByWindow.get(window.id);
    if (keys && keys.size > 1) return null;
    const number = /^(Temporada \d+) \(prevista\)$/.exec(window.label)?.[1];
    return number && keys?.has(normalize(number)) && aliases.get(normalize(number)) === window.id
      ? number : seasonLabel(window.label);
  }

  function resolve(at: string, season: string | null, fallback?: string) {
    const official = seasonLabel(season);
    if (official) {
      return { season: official, seasonEstimated: false };
    }

    const catalog = windowAt(at);
    const estimated = catalog ? displayWindow(catalog) : seasonLabel(fallback);
    return { season: estimated, seasonEstimated: estimated !== null };
  }

  return {
    selection: (value: string) => {
      const label = seasonLabel(value);
      if (!label) return '';
      const key = normalize(label);
      const window = calendar.find(item => normalize(item.label) === key || item.id === value || identity(item.label) === identity(value));
      return (window && displayWindow(window)) ?? resolve('', label).season ?? '';
    },
    reading: (reading: Progress): Progress => {
      if (reading.score === null && !reading.rank) return reading;
      return { ...reading, ...resolve(reading.at, reading.season) };
    },
    battle: (match: Battle) => match.ranked ? resolve(match.played_at,
      match.season_source ? null : match.season, match.season_by_date?.label) : { season: null, seasonEstimated: false },
  };
}
