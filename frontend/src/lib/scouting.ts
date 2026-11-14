import { useContext, useEffect, useState } from 'react';
import type { Battle, Filters } from '@/lib/data';
import { groupStats, localDay, normalize, stats } from '@/lib/data';
import { brawlers } from '@/components/game';
import { LiveMeta } from '@/lib/live';
import type { LivePeriod } from '@/lib/live';
import { draftMetaMapKey } from '@/lib/draftmeta';

export type PublicContext = { key: string; mode: string | null; map: string | null; sets: number; decisive?: number; latest?: string|null };
export type PublicIndex = {
  source: string; url: string; start: string; end: string; season: string; contexts: PublicContext[]; unit?: 'registros'|'séries'; latest?: string|null;
};
export type PublicStats = { picks: [number, number, number, number?][]; pairs: [number, number, number, number][];
  allies?: [number, number, number, number][]; bans?: [number,number][]; banKnown?: number };
export type ScoutingRow = { name: string; wins: number; games: number; pickCount?: number; details: { name: string; wins: number; games: number }[] };
export const byId = new Map(brawlers.map(b => [b.id, b]));
const contextCache = new Map<string, Promise<PublicStats>>();
let indexRequest: Promise<PublicIndex> | null = null;

function getIndex() {
  indexRequest ??= fetch('/scouting/index.json').then(async response => {
    if (!response.ok) throw new Error();
    return await response.json() as PublicIndex;
  }).catch(error => { indexRequest = null; throw error; });
  return indexRequest;
}

function getContext(key: string) {
  if (!contextCache.has(key)) {
    contextCache.set(key, fetch(`/scouting/${key}.json`).then(async response => {
      if (!response.ok) throw new Error();
      return await response.json() as PublicStats;
    }).catch(error => { contextCache.delete(key); throw error; }));
  }
  return contextCache.get(key)!;
}

export function usePublicStats(mode: string | null, map: string | null, filters?: Filters, selectedPeriod?: LivePeriod) {
  const { report, period: contextPeriod }=useContext(LiveMeta);
  const period = selectedPeriod ?? contextPeriod;
  const [reference, setReference] = useState<PublicIndex | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; sample: PublicStats } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let alive = true; void getIndex().then(v => { if (alive) setReference(v); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; }; }, []);
  const stored = period==='reference' ? null : report?.windows[period];
  const live=period==='today'&&stored?.end!==localDay(new Date().toISOString())?null:stored;
  const index:PublicIndex|null=period==='reference'?reference:live?{
    source:live.minimum_elo!=null||period==='competitive'?'Amostra com Elo de perfil · Supercell':'Amostra de outros jogadores · Supercell',
    url:'https://developer.brawlstars.com/', start:live.start, end:live.end, season:'',
    unit:'registros', latest:live.latest, contexts:live.contexts.map((c,i)=>({...c,key:'live'+i})),
  }:null;
  const mapKey=(s:string|null)=>draftMetaMapKey(s ?? '');
  const dateMismatch = index && filters && ((filters.start && filters.start > index.start) || (filters.end && filters.end < index.end));
  const seasonMismatch = index && filters?.season && normalize(filters.season).replace(/[^a-z0-9]/g,'') !== normalize(index.season);
  const context = dateMismatch || seasonMismatch || filters?.rank_label ? undefined : index?.contexts.find(c =>
    (map ? mapKey(c.map)===mapKey(map) && (!mode || normalize(c.mode)===normalize(mode)) :
      !c.map && normalize(c.mode)===normalize(mode)));
  const key=period==='reference'?context?.key:undefined;
  useEffect(() => { if (!key) return;
    let alive = true;
    void getContext(key).then(sample => { if (alive) { setFailed(false); setLoaded({key,sample}); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [key]);
  const liveContext=period!=='reference'&&context&&live ? live.contexts[Number(context.key.slice(4))] : undefined;
  const sample=period==='reference' ? loaded&&loaded.key===key ? loaded.sample:null : liveContext?.sample??null;
  return {index,context,sample,loading:period==='reference'&&!failed&&(!reference||Boolean(key&&loaded?.key!==key)),failed};
}

export function wilson(wins: number, games: number, upper = false) {
  if (!games) return 0;
  const p = wins / games, z = 1.96, k = z * z / games;
  const margin = z * Math.sqrt(p * (1 - p) / games + k / (4 * games));
  return (p + k / 2 + (upper ? margin : -margin)) / (1 + k);
}

export function ordered<T extends { wins: number; games: number }>(rows: T[], worst = false) {
  return rows.slice().sort((a,b) => Number(!a.games)-Number(!b.games) || (worst
    ? wilson(a.wins,a.games,true) - wilson(b.wins,b.games,true)
    : wilson(b.wins,b.games) - wilson(a.wins,a.games)) || b.games - a.games);
}

export function publicPicks(sample: PublicStats | null): ScoutingRow[] {
  return sample?.picks.flatMap(([id,wins,games,pickCount]) => {
    const name = byId.get(id)?.name;
    return name ? [{ name,wins,games,pickCount:pickCount??games,details:[] }] : [];
  }) ?? [];
}

export function publicCounters(sample: PublicStats | null, enemies: string[]): ScoutingRow[] {
  if (!sample || !enemies.length) return [];
  const enemyIds = new Map(brawlers.filter(b => enemies.some(e => normalize(e) === normalize(b.name))).map(b => [b.id,b.name]));
  const pairs = new Map<number, ScoutingRow>();
  for (const [id, opponent, wins, games] of sample.pairs) {
    const target = enemyIds.get(opponent), name = byId.get(id)?.name;
    if (!target || !name) continue;
    const row = pairs.get(id) ?? { name, wins: 0, games: 0, details: [] };
    row.wins += wins; row.games += games; row.details.push({ name: target, wins, games });
    pairs.set(id, row);
  }
  return [...pairs.values()].sort((a,b) => b.details.length - a.details.length ||
    (b.details.reduce((v,p) => v + wilson(p.wins,p.games),0) / b.details.length)
    - (a.details.reduce((v,p) => v + wilson(p.wins,p.games),0) / a.details.length));
}

export function accountCounters(battles: Battle[], enemies: string[]): ScoutingRow[] {
  if (!enemies.length) return [];
  const targetSet = new Set(enemies.map(normalize));
  return groupStats(battles, b => [b.player_brawler]).flatMap(g => {
    const rows = battles.filter(b => normalize(b.player_brawler) === normalize(g.label) &&
      b.players.some(p => p.side === 'opponent' && targetSet.has(normalize(p.brawler))));
    const s = stats(rows);
    const details = enemies.flatMap(name => {
      const d = stats(rows.filter(b => b.players.some(p => p.side === 'opponent' && normalize(p.brawler) === normalize(name))));
      return d.decided ? [{name,wins:d.wins,games:d.decided}] : [];
    });
    return s.decided ? [{name:g.label,wins:s.wins,games:s.decided,details}] : [];
  }).sort((a,b) => b.details.length - a.details.length || wilson(b.wins,b.games)-wilson(a.wins,a.games));
}

export function draftPicks(sample:PublicStats|null, rows:ScoutingRow[], allies:string[], enemies:string[]) {
  if (!sample || (!allies.length&&!enemies.length)) return ordered(rows);
  const ids = (names:string[])=>new Set(brawlers.filter(b=>names.some(n=>normalize(n)===normalize(b.name))).map(b=>b.id));
  const enemy=ids(enemies), team=ids(allies);
  const related=(pairs:NonNullable<PublicStats['allies']>, targets:Set<number>)=>{
    const found=new Map<number,ScoutingRow['details']>();
    for(const [a,b,wins,games] of pairs){
      const name=byId.get(b)?.name;
      if(!targets.has(b)||!name)continue;
      const notes=found.get(a)??[];notes.push({name,wins,games});found.set(a,notes);
    }
    return found;
  };
  const versus=related(sample.pairs,enemy), withAlly=related(sample.allies??[],team);
  const names=new Map(brawlers.map(b=>[normalize(b.name),b.id]));
  return rows.map(row=>{
    const id=names.get(normalize(row.name))??0;
    const counters=versus.get(id)??[], synergies=withAlly.get(id)??[];
    const base=row.games?row.wins/row.games:.5;
    const lift=(details:ScoutingRow['details'])=>details.length?details.reduce((sum,d)=>
      sum+Math.max(-.18,Math.min(.18,(d.wins+base*30)/(d.games+30)-base)),0)/details.length:0;
    return {...row,details:counters,synergies,score:wilson(row.wins,row.games)+.7*lift(counters)+.4*lift(synergies)};
  }).sort((a,b)=>b.score-a.score||b.games-a.games);
}
