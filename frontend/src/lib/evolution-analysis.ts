import { normalize, stats } from './data';
import { mapKey } from './external-comparison';
import { rankedSessions } from './coaching';
import type { TrainingMetric } from './coaching';
import type { LiveWindow } from './live';
import type { MatchSeries } from './match-series';
import { seriesMeasurements } from './ranked-analysis';
import { playerPick } from './season-comparison';

function mapGroup(match:MatchSeries) {
  const {map_name:name,mode} = match.latest;
  const key = mapKey(name);
  return { id:key?JSON.stringify([normalize(mode),key]):'', name, mode };
}

export function diagnoseMapMix(current:MatchSeries[], previous:MatchSeries[]) {
  type Group = ReturnType<typeof mapGroup> & { current:MatchSeries[]; previous:MatchSeries[] };
  const groups = new Map<string,Group>();
  const totals = {current:stats(current),previous:stats(previous)};
  if (!totals.current.decided || !totals.previous.decided) return null;
  for (const [period,matches] of [['current',current],['previous',previous]] as const) {
    for (const match of matches) {
      if (match.result!=='victory'&&match.result!=='defeat') continue;
      const map = mapGroup(match);
      const group:Group = groups.get(map.id) ?? {...map,current:[],previous:[]};
      group[period].push(match);
      groups.set(map.id,group);
    }
  }
  const rows = [...groups.values()].map(group=>{
    const now = stats(group.current), before = stats(group.previous);
    const currentShare = now.decided/totals.current.decided, previousShare = before.decided/totals.previous.decided;
    const common = Boolean(group.id)&&now.rate!==null&&before.rate!==null;
    const within = common ? (currentShare+previousShare)/2*(now.rate!-before.rate!) : null;
    const mix = common ? (currentShare-previousShare)*(now.rate!+before.rate!)/2 : null;
    const unmatched = common ? null : (now.rate??0)*currentShare-(before.rate??0)*previousShare;
    return {...group,now,before,currentShare,previousShare,within,mix,unmatched};
  }).sort((a,b)=>b.now.decided+b.before.decided-a.now.decided-a.before.decided);
  const sum = (key:'within'|'mix'|'unmatched')=>rows.reduce((total,row)=>total+(row[key]??0),0);
  return {
    rows, within:sum('within'), mix:sum('mix'), unmatched:sum('unmatched'),
    total:totals.current.rate!-totals.previous.rate!,
  };
}

export function patchComparison(
  matches:MatchSeries[], current:LiveWindow|undefined, previous:LiveWindow|undefined, observedAt:number,
) {
  if (!current?.start_at || !current.end_at || !previous?.start_at || !previous.end_at) return null;
  const start = Date.parse(current.start_at), end = Date.parse(current.end_at);
  const previousStart = Date.parse(previous.start_at), previousEnd = Date.parse(previous.end_at);
  if (![start,end,previousStart,previousEnd,observedAt].every(Number.isFinite) || previousEnd>start) return null;
  const duration = Math.min(Math.min(end,observedAt)-start,previousEnd-previousStart);
  if (duration<=0) return null;
  const window = { current:{start,end:start+duration},previous:{start:previousEnd-duration,end:previousEnd} };
  type Group = ReturnType<typeof mapGroup> & { brawler:string; current:MatchSeries[]; previous:MatchSeries[] };
  const groups = new Map<string,Group>();
  const unknown = {current:0,previous:0};
  for (const match of matches) {
    const first = Date.parse(match.rounds[0]?.played_at), last = Date.parse(match.latest.played_at);
    const period=first>=window.current.start&&last<window.current.end?'current'
      :first>=window.previous.start&&last<window.previous.end?'previous':null;
    if (!period) continue;
    const map = mapGroup(match);
    const brawler = playerPick(match);
    if (!map.id || !map.mode || !brawler) {unknown[period]++;continue;}
    const id=JSON.stringify([map.id,normalize(brawler)]);
    const group:Group=groups.get(id)??{...map,id,brawler,current:[],previous:[]};
    group[period].push(match);
    groups.set(id,group);
  }
  const rows = [...groups.values()].map(group=>({...group,now:stats(group.current),before:stats(group.previous)}))
    .sort((a,b)=>b.now.decided+b.before.decided-a.now.decided-a.before.decided);
  return {window,duration,unknown,rows,metaComparable:window.current.end===end&&window.previous.start===previousStart};
}

export function sessionStartsAndEnds(history:MatchSeries[], allowed:ReadonlySet<string>) {
  const rows=rankedSessions(history,[]).flatMap(session=>{
    const count=Math.floor(session.matches.length/2);
    if (!count) return [];
    const start=session.matches.slice(0,count).filter(match=>allowed.has(match.id));
    const end=session.matches.slice(-count).filter(match=>allowed.has(match.id));
    if (!start.length || !end.length) return [];
    return [{...session,start,end,firstHalf:stats(start),lastHalf:stats(end)}];
  });
  return {rows,start:stats(rows.flatMap(row=>row.start)),end:stats(rows.flatMap(row=>row.end))};
}

export function trainingMetricReadings(matches:MatchSeries[], metric:TrainingMetric) {
  const rows = matches.flatMap<{match:MatchSeries;value:number}>(match=>{
    if (metric==='safePerMinute' && normalize(match.latest.mode)!=='heist') return [];
    const value=seriesMeasurements(match)[metric];
    return value===undefined?[]:[{match,value}];
  });
  return { rows, average:rows.length?rows.reduce((total,row)=>total+row.value,0)/rows.length:null };
}
