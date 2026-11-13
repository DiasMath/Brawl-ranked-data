import { createContext } from 'react';
import type { PublicStats } from '@/lib/scouting';
import { localDay } from '@/lib/data';
import type { Update } from '@/lib/data';

export type LivePeriod = 'patch' | 'previous_patch' | 'season' | 'today' | 'week' | 'competitive' | 'reference';
export type LiveMap = { map: string | null; mode: string | null; sets: number; decisive: number; latest?: string|null; sample: PublicStats };
export type LiveWindow = {
  label: string; start: string; end: string; latest: string | null; contexts: LiveMap[];
  start_at?: string; end_at?: string; source_url?: string; date_only?: boolean; minimum_elo?: number;
};
export type LiveReport = {
  diagnostics?: {
    database_bytes: number; sample_bytes: number; account_battle_bytes: number; sample_records: number; played_last_24h: number;
    last_run: {
      finished_at: string; origin: 'manual'|'scheduled'; environment: 'development'|'production'; status: 'ok'|'partial'|'error';
      profile_requests: number; battlelog_requests: number; ranking_requests: number; unique_received: number; added: number;
    } | null;
  };
  tracking?: { queued: number; checked: number; qualified: number; due?: number; minimum_elo: number; last_run_at: string|null };
  windows: Partial<Record<Exclude<LivePeriod,'reference'>,LiveWindow>>;
};

const periodLabels: [LivePeriod, string][] = [
  ['patch','Patch atual'], ['previous_patch','Patch anterior'], ['season','Temporada'],
  ['competitive','Alto nível · 7 dias'], ['today','Hoje'], ['week','7 dias'], ['reference','Histórico 4–5/11'],
];

export function metaPeriods(report: LiveReport | null) {
  return periodLabels.filter(([key])=>key==='reference'||!!report?.windows[key]);
}

export function defaultMetaPeriod(report: LiveReport): LivePeriod {
  return metaPeriods(report)[0]?.[0] ?? 'reference';
}

export function inMetaPeriod(played: string, period: LivePeriod, report: LiveReport | null) {
  const window = period === 'reference' ? null : report?.windows[period];
  const stamp = Date.parse(played);
  if (window?.start_at && window.end_at) {
    return stamp >= Date.parse(window.start_at) && stamp < Date.parse(window.end_at);
  }
  const day = localDay(played);
  if (period === 'reference') return day >= '2026-11-04' && day <= '2026-11-05';
  return !!window && day >= window.start && day <= window.end;
}

export const LiveMeta = createContext<{ report: LiveReport | null; period: LivePeriod; setPeriod: (v: LivePeriod) => void }>({
  report: null, period: 'reference', setPeriod: () => {},
});

export type ServerCollection = {
  player_tag: string; configured: boolean; interval_seconds: number;
  last_attempt: (Update & { phase?: 'profile'|'battlelog'|'saving'|null; processed?: number|null })|null;
  last_success: string|null; last_battle: string|null;
  last_possible_gap: string|null; retry_until: string|null;
};

export type SyncProgress = {
  phase: 'profile'|'battlelog'|'saving'|'history';
  processed: number|null;
  total: number|null;
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
