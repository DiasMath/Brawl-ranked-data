import { createContext } from 'react';
import type { PublicStats } from './scouting';
import type { Update } from './data';

export type LivePeriod = 'today' | 'week' | 'patch' | 'reference';
export type LiveMap = { map: string | null; mode: string | null; sets: number; decisive: number; latest?: string|null; sample: PublicStats };
export type LiveWindow = { label: string; start: string; end: string; latest: string | null; contexts: LiveMap[] };
export type LiveReport = {
  schema: 'brawl-live-1'; generated: string; patchSince: string | null;
  status: { lastPersonal: string | null; lastSample: string | null; lastPossibleGap?: string | null; sampled: number; attempted: number;
    newPersonal: number; errors: {part:string;code:number;detail?:string}[]; nextAllowed: string | null };
  account: { format: 'supercell-brawl-v1'; player_tag: string; log_at?: string } | null;
  windows: Partial<Record<Exclude<LivePeriod,'reference'>,LiveWindow>>;
};

export const LiveMeta = createContext<{ report: LiveReport | null; period: LivePeriod; setPeriod: (v: LivePeriod) => void }>({
  report: null, period: 'reference', setPeriod: () => {},
});

export type ServerCollection = {
  player_tag: string; configured: boolean; interval_seconds: number;
  last_attempt: Update|null; last_success: string|null; last_battle: string|null;
  last_possible_gap: string|null; retry_until: string|null;
};

export async function collectionRequest<T>(path:string, init?:RequestInit):Promise<T> {
  const response=await fetch(path,{...init,cache:'no-store'});
  const json=await response.json().catch(()=>null);
  if(!response.ok||!json)throw new Error(typeof json?.detail==='string'?json.detail:'O servidor de coleta está indisponível.');
  return json as T;
}

export function observedDelay(rows: { played_at: string; first_seen_at?: string | null; delay_observed?: boolean }[]) {
  const sample = rows.flatMap(r => {
    if (!r.delay_observed || !r.first_seen_at) return [];
    const minutes = (Date.parse(r.first_seen_at) - Date.parse(r.played_at))/60000;
    return Number.isFinite(minutes) && minutes >= 0 ? [minutes] : [];
  }).sort((a,b)=>a-b);
  return { count: sample.length, median: sample.length ? Math.round((sample[Math.floor((sample.length-1)*.5)]+sample[Math.ceil((sample.length-1)*.5)])/2) : null,
    p90: sample.length ? Math.round(sample[Math.ceil(sample.length*.9)-1]) : null };
}
