import type { Battle, Dataset, Meta } from '@/lib/data';
import { emptyData, normalize, parseSnapshot } from '@/lib/data';
import rankTable from '@/lib/catalog/ranks.json';

export type Account = { tag: string; name: string };
export type Progress = {
  id: string; at: string; trophies: number | null; score: number | null; rank: string | null;
  season: string | null; source: string; method: 'api' | 'manual';
};
export type MetaMatchup = {
  brawler: string; opponent: string; map_name: string | null; mode: string | null;
  rank_label: string | null; season: string | null; wins: number; games: number;
  source_name: string; source_url: string; period_start: string; period_end: string;
};
export type LocalData = { serverRunId?: number; serverHistoryVersion?: number; dataset: Dataset; progress: Progress[]; matchups: MetaMatchup[]; raw: Record<string, unknown> };
export type AccountBook = { active: string; accounts: Account[] };

type StoreName = 'data';
let connection: Promise<IDBDatabase> | null = null;

function db() {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('brawl-ranked-lab', 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('data');
      };
      open.onsuccess = () => {
        const opened = open.result;
        opened.onversionchange = () => { opened.close(); connection = null; };
        resolve(opened);
      };
      open.onerror = () => reject(open.error);
    }).catch(error => { connection = null; throw error; });
  }
  return connection;
}

async function read<T>(name: StoreName, key: string): Promise<T | undefined> {
  const opened = await db();
  return new Promise((resolve, reject) => {
    const request = opened.transaction(name, 'readonly').objectStore(name).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function write(name: StoreName, key: string, value: unknown) {
  const opened = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = opened.transaction(name, 'readwrite');
    tx.objectStore(name).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const initialBook: AccountBook = { active: emptyData.player_tag, accounts: [] };
export const blankLocal = (tag: string): LocalData => ({ dataset: { ...emptyData, player_tag: tag }, progress: [], matchups: [], raw: {} });
export const loadBook = async () => await read<AccountBook>('data', 'accounts') ?? initialBook;
export const saveBook = (book: AccountBook) => write('data', 'accounts', book);
export const loadLocal = async (tag: string) => await read<LocalData>('data', 'account:' + tag) ?? blankLocal(tag);
export const saveLocal = (data: LocalData) => write('data', 'account:' + data.dataset.player_tag, data);

function record(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
}
const txt = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const int = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const count = (value: unknown) => { const n = int(value); return n !== null && n >= 0 ? n : null; };
const rankLabel = (value: unknown) => txt(value) ?? rankTable.find(r=>r.id===value)?.label ?? null;
const list = (input: unknown): unknown[] => Array.isArray(input) ? input : [];

export function mergeBattles(previous: Battle[], incoming: Battle[]) {
  const map = new Map(previous.map(row => [row.id, row]));
  for (const next of incoming) {
    const old = map.get(next.id);
    if (!old) { map.set(next.id, next); continue; }
    map.set(next.id, {
      ...old, ...next, event_id: next.event_id ?? old.event_id, map_name: next.map_name ?? old.map_name,
      mode: next.mode ?? old.mode, result: next.result ?? old.result, player_brawler: next.player_brawler ?? old.player_brawler,
      trophy_change: next.trophy_change ?? old.trophy_change,
      first_seen_at: old.first_seen_at && (!next.first_seen_at || old.first_seen_at < next.first_seen_at)
        ? old.first_seen_at : next.first_seen_at,
      delay_observed: old.first_seen_at && (!next.first_seen_at || old.first_seen_at < next.first_seen_at)
        ? old.delay_observed : next.delay_observed,
      rank_label: next.rank_label ?? old.rank_label, rank_score: next.rank_score ?? old.rank_score,
      season: next.season ?? old.season, bans: next.bans ?? old.bans,
      rank_reference: next.rank_label !== null ? next.rank_reference : old.rank_reference,
      score_reference: next.rank_score !== null ? next.score_reference : old.score_reference,
      season_reference: next.season !== null ? next.season_reference : old.season_reference,
      bans_reference: next.bans !== null ? next.bans_reference : old.bans_reference,
      rank_source: next.rank_label !== null ? next.rank_source : old.rank_source,
      score_source: next.rank_score !== null ? next.score_source : old.score_source,
      season_source: next.season !== null ? next.season_source : old.season_source,
      bans_source: next.bans !== null ? next.bans_source : old.bans_source,
      players: next.players.length ? next.players : old.players,
    });
  }
  return [...map.values()].sort((a, b) => b.played_at.localeCompare(a.played_at));
}

export function fromSnapshot(input: unknown, previous: LocalData): LocalData {
  const incoming = parseSnapshot(input);
  if (incoming.player_tag !== previous.dataset.player_tag) throw new Error('O arquivo pertence a outra tag. Abra ou cadastre essa conta primeiro.');
  const extension = record(input);
  const rawEntries = Object.entries(record(extension.raw)).filter(([id]) => /^[a-f0-9]{64}$/.test(id));
  const importedProgress = list(extension.progress).flatMap(v => {
    const p = record(v);
    if (typeof p.id !== 'string' || typeof p.at !== 'string' || !Number.isFinite(Date.parse(p.at))
      || typeof p.source !== 'string' || (p.method !== 'api' && p.method !== 'manual')) return [];
    return [{ id: p.id, at: p.at, trophies: count(p.trophies), score: count(p.score), rank: p.method==='api' && typeof p.rank==='string' && /^\d+$/.test(p.rank) ? rankLabel(Number(p.rank)) : txt(p.rank),
      season: txt(p.season), source: p.source, method: p.method } satisfies Progress];
  });
  const importedMatchups = list(extension.matchups).map(v => record(v)).filter(r =>
    typeof r.brawler === 'string' && typeof r.opponent === 'string' && typeof r.source_name === 'string'
    && typeof r.source_url === 'string' && /^https?:\/\//i.test(r.source_url)
    && typeof r.period_start === 'string' && typeof r.period_end === 'string'
    && count(r.wins) !== null && count(r.games) !== null && Number(r.games) > 0 && Number(r.wins) <= Number(r.games)
    && [r.map_name,r.mode,r.rank_label,r.season].every(v => v === null || typeof v === 'string')
  ) as MetaMatchup[];
  const profile = !incoming.profile || (previous.dataset.profile && previous.dataset.profile.fetched_at > incoming.profile.fetched_at)
    ? previous.dataset.profile : incoming.profile;
  const displayRank = (rank: string | null | undefined) =>
    rank && /^\d+$/.test(rank) ? rankLabel(Number(rank)) : rank ?? null;
  const matches = incoming.matches.map(match => ({...match, rank_label: displayRank(match.rank_label)}));
  return {
    ...previous,
    dataset: { ...incoming, profile: profile ? {...profile, rank_label: displayRank(profile.rank_label)} : null,
      matches: mergeBattles(previous.dataset.matches, matches),
      updates: [...new Map([...previous.dataset.updates, ...incoming.updates].map(v => [v.started_at, v])).values()]
        .sort((a,b) => b.started_at.localeCompare(a.started_at)).slice(0,100),
      meta: [...new Map([...previous.dataset.meta, ...incoming.meta].map(r => [`${sourceKey(r)}|${rowKey(r)}`, r])).values()],
    },
    progress: [...new Map([...previous.progress, ...importedProgress].map(p => [p.id, p])).values()],
    raw: { ...previous.raw, ...Object.fromEntries(rawEntries) },
    matchups: [...new Map([...previous.matchups, ...importedMatchups].map(r => [`${sourceKey(r)}|${rowKey(r)}|${normalize(r.opponent)}`,r])).values()],
  };
}

const sourceKey = (r: Pick<Meta, 'source_name'|'source_url'|'period_start'|'period_end'>) =>
  [r.source_name, r.source_url, r.period_start, r.period_end].join('|');
const rowKey = (r: Pick<Meta, 'map_name'|'mode'|'rank_label'|'season'|'brawler'>) =>
  [r.map_name, r.mode, r.rank_label, r.season, r.brawler].map(normalize).join('|');

export function downloadSnapshot(local: LocalData) {
  const value = JSON.stringify({ ...local.dataset, exported_at: new Date().toISOString(), progress: local.progress,
    matchups: local.matchups, raw: local.raw });
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `brawl-${local.dataset.player_tag.slice(1)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
