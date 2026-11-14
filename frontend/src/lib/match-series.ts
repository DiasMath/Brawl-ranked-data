import { filtered, localDay, normalize } from './data';
import { draftMetaMapKey } from './draftmeta';
import type { Battle, BattleElo, Filters } from './data';
import type { Progress } from './browser-store';

export type MatchSeries = {
  id: string;
  latest: Battle;
  rounds: Battle[];
  result: Battle['result'];
  wins: number;
  losses: number;
};

function lineup(battle: Battle) {
  if (!battle.ranked || !battle.mode || (!battle.event_id && !battle.map_name) || battle.players.length !== 6) return null;
  const players = new Map<string,Battle['players'][number]>();
  const counts = {self:0, ally:0, opponent:0, unknown:0};
  for (const player of battle.players) {
    const tag = normalize(player.player_tag), name = normalize(player.brawler);
    if (!tag || players.has(tag) || (!player.brawler_id && !name)) return null;
    players.set(tag,player);
    counts[player.side]++;
  }
  return counts.self===1&&counts.ally===2&&counts.opponent===3?players:null;
}

function sameMap(first: Battle, second: Battle) {
  if(first.event_id&&second.event_id)return first.event_id===second.event_id;
  const name=draftMetaMapKey(first.map_name??'');
  return !!name&&name===draftMetaMapKey(second.map_name??'');
}

function sameLineup(first: ReturnType<typeof lineup>, second: ReturnType<typeof lineup>) {
  if(!first||!second)return false;
  return [...first].every(([tag,player])=>{
    const next=second.get(tag);
    if(!next||next.side!==player.side)return false;
    if(player.brawler_id&&next.brawler_id)return player.brawler_id===next.brawler_id;
    return !!player.brawler&&normalize(player.brawler)===normalize(next.brawler);
  });
}

function makeSeries(rounds: Battle[], wins: number, losses: number): MatchSeries {
  const latest = rounds[rounds.length-1];
  const result = rounds.length === 1 ? latest.result : wins === 2 ? 'victory' : losses === 2 ? 'defeat' : null;
  return {id:rounds[0].id, latest, rounds, result, wins, losses};
}

export function matchSeries(battles: Battle[]): MatchSeries[] {
  const sorted = [...battles].sort((a,b)=>Date.parse(a.played_at)-Date.parse(b.played_at));
  const series: MatchSeries[] = [];
  let rounds: Battle[] = [], signature: ReturnType<typeof lineup> = null, wins = 0, losses = 0;
  for (const battle of sorted) {
    const key = lineup(battle);
    const previous = rounds.at(-1);
    const gap = previous ? (Date.parse(battle.played_at)-Date.parse(previous.played_at))/1000 : 0;
    // Allow a long round plus the break. Without durations use a bounded time window.
    const limit = Math.min(360,Math.max(240,(previous?.duration_seconds??0)+60,(battle.duration_seconds??0)+60));
    if (previous && (previous.api_type!==battle.api_type || normalize(previous.mode)!==normalize(battle.mode)
        || !sameMap(previous,battle) || !sameLineup(signature,key)
        || !(gap > 0 && gap <= limit) || wins === 2 || losses === 2)) {
      series.push(makeSeries(rounds,wins,losses));
      rounds = [];
      wins = 0;
      losses = 0;
    }
    rounds.push(battle);
    signature = key;
    wins += Number(battle.result === 'victory');
    losses += Number(battle.result === 'defeat');
  }
  if (rounds.length) series.push(makeSeries(rounds,wins,losses));
  return series.reverse();
}

export function seriesDuration(match: MatchSeries) {
  if(match.rounds.some(round=>round.duration_seconds==null))return null;
  return match.rounds.reduce((total,round)=>total+(round.duration_seconds??0),0);
}

export function seriesPerformance(matches: MatchSeries[]) {
  const time = { victory:{ seconds:0, count:0 }, defeat:{ seconds:0, count:0 } };
  const results = { victory:0, defeat:0 };
  let lostOpening=0, comebacks=0;
  for(const match of matches){
    if(!match.latest.ranked||!match.result||match.result==='draw')continue;
    const {rounds,result}=match;
    const winnerCount=rounds.filter(round=>round.result===result).length;
    const loserCount=rounds.filter(round=>round.result===(result==='victory'?'defeat':'victory')).length;
    if(winnerCount!==2||loserCount>1||rounds.some(round=>round.result===null)||rounds.at(-1)?.result!==result)continue;

    results[result]++;
    if(rounds[0].result==='defeat'){
      lostOpening++;
      if(result==='victory')comebacks++;
    }
    const duration=seriesDuration(match);
    if(duration!==null){
      time[result].seconds+=duration;
      time[result].count++;
    }
  }
  const duration=(result:'victory'|'defeat')=>{
    const {seconds,count}=time[result];
    return {average:count?Math.round(seconds/count):null,count,total:results[result]};
  };
  return {victories:duration('victory'),defeats:duration('defeat'),comebacks,lostOpening,
    comebackRate:lostOpening?comebacks/lostOpening:null};
}

export function seriesInScope(series: MatchSeries[], battles: Battle[]) {
  const ids = new Set(battles.map(battle=>battle.id));
  return series.filter(match=>match.rounds.some(round=>ids.has(round.id)));
}

export function filteredSeries(series: MatchSeries[], battles: Battle[], filters: Filters, rankedOnly: boolean, elo?:Map<string,MatchElo>) {
  const scoped = filtered(battles,{...filters,start:'',end:'',rank_label:''},rankedOnly);
  return seriesInScope(series,scoped).filter(match=>{
    const rank=seriesRank(match)?.rank_label??elo?.get(match.id)?.rank;
    if (filters.rank_label && normalize(rank)!==normalize(filters.rank_label) &&
      !match.rounds.some(round=>!round.rank_source&&normalize(round.rank_label)===normalize(filters.rank_label))) return false;
    if (!filters.start && !filters.end) return true;
    const day = localDay(match.latest.played_at);
    return (!filters.start || day >= filters.start) && (!filters.end || day <= filters.end);
  });
}

export function matchKd(match: MatchSeries) {
  if ((match.rounds.length > 1 && !match.result) || match.rounds.some(round=>!round.kd||round.kd.reference)) return null;
  return match.rounds.reduce((total,round)=>({
    kills:total.kills+(round.kd?.kills??0), deaths:total.deaths+(round.kd?.deaths??0),
  }),{kills:0,deaths:0});
}

export type MatchElo = Pick<BattleElo,'before'|'after'> & { rank?:string };

export function seriesRank(match: MatchSeries, round=match.latest) {
  if (round.rank_label&&!round.rank_source) return round;
  const known = match.rounds.filter(item=>item.rank_label&&!item.rank_source);
  return known.every(item=>normalize(item.rank_label)===normalize(known[0]?.rank_label))
    ? known[0] : undefined;
}

export function seriesBans(match: MatchSeries, round=match.latest) {
  if (round.bans!==null&&!round.bans_source) return round;
  const known=match.rounds.filter(item=>item.bans!==null&&!item.bans_source);
  const signature=(item: Battle)=>JSON.stringify(item.bans?.map(normalize).sort());
  return known.every(item=>signature(item)===signature(known[0]))
    ? known[0] : undefined;
}

export function matchEloChanges(series: MatchSeries[], readings: Progress[]) {
  const ranked = series.filter(match=>match.latest.ranked).reverse();
  const scores = readings.filter(read=>read.method==='api' && read.id.startsWith('server:') && read.score!==null && read.season)
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const values = new Map<string, MatchElo>();
  let readingIndex = 0;
  for (const [index,match] of ranked.entries()) {
    if (match.latest.duration_seconds==null || !match.result || match.rounds.some(round=>!round.delay_observed)) continue;
    const start = Date.parse(match.rounds[0].played_at);
    const end = Date.parse(match.latest.played_at) + match.latest.duration_seconds*1000;
    while (readingIndex<scores.length && Date.parse(scores[readingIndex].at)<start) readingIndex++;
    const before = scores[readingIndex-1];
    let endIndex = readingIndex;
    while (endIndex<scores.length && Date.parse(scores[endIndex].at)<=end) endIndex++;
    const after = scores[endIndex];
    if (!before || !after || before.season!==after.season || before.score===null || after.score===null) continue;
    const from = Date.parse(before.at), to = Date.parse(after.at);
    const previous = ranked[index-1]?.latest, next = ranked[index+1]?.rounds[0];
    const previousEnd = previous ? Date.parse(previous.played_at)+(previous.duration_seconds??0)*1000 : -Infinity;
    if (to-from>20*60_000 || previousEnd>=from || (next && Date.parse(next.played_at)<=to)) continue;
    if (match.rounds.some(round=>round.season && normalize(round.season)!==normalize(before.season))) continue;
    // Accept intermediate readings that remain at the starting score or settle at the ending score.
    const during=scores.slice(readingIndex,endIndex);
    let reachedAfter=false;
    if (during.some(read=>{
      if (read.season!==before.season || (read.score!==after.score && (reachedAfter || read.score!==before.score))) return true;
      if (read.score===after.score) reachedAfter=true;
      return false;
    })) continue;
    const delta=after.score-before.score;
    if ((match.result==='victory' && delta<=0) || (match.result==='defeat' && delta>=0) || match.result==='draw') continue;
    const rank = before.rank && normalize(before.rank)===normalize(after.rank) &&
      during.every(read=>!read.rank||normalize(read.rank)===normalize(before.rank)) ? before.rank : undefined;
    values.set(match.id,{before:before.score,after:after.score,...(rank?{rank}:{})});
  }
  return values;
}
