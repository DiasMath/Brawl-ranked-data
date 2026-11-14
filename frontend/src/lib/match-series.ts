import { filtered, localDay, normalize } from './data';
import { draftMetaMapKey } from './draftmeta';
import type { Battle, Filters } from './data';

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
  const groups: Record<Battle['players'][number]['side'], string[]> = {self:[], ally:[], opponent:[], unknown:[]};
  const tags = new Set<string>();
  for (const player of battle.players) {
    const tag = normalize(player.player_tag), name = normalize(player.brawler);
    if (!tag || tags.has(tag) || (!player.brawler_id && !name)) return null;
    tags.add(tag);
    groups[player.side].push(tag+'|'+(player.brawler_id ?? name));
  }
  if (groups.self.length !== 1 || groups.ally.length !== 2 || groups.opponent.length !== 3) return null;
  return JSON.stringify([battle.api_type, battle.mode, battle.event_id || draftMetaMapKey(battle.map_name ?? ''),
    groups.self, groups.ally.sort(), groups.opponent.sort()]);
}

function makeSeries(rounds: Battle[], wins: number, losses: number): MatchSeries {
  const latest = rounds[rounds.length-1];
  const result = rounds.length === 1 ? latest.result : wins === 2 ? 'victory' : losses === 2 ? 'defeat' : null;
  return {id:rounds[0].id, latest, rounds, result, wins, losses};
}

export function matchSeries(battles: Battle[]): MatchSeries[] {
  const sorted = [...battles].sort((a,b)=>Date.parse(a.played_at)-Date.parse(b.played_at));
  const series: MatchSeries[] = [];
  let rounds: Battle[] = [], signature: string|null = null, wins = 0, losses = 0;
  for (const battle of sorted) {
    const key = lineup(battle);
    const previous = rounds.at(-1);
    const gap = previous ? (Date.parse(battle.played_at)-Date.parse(previous.played_at))/1000 : 0;
    // Allow a long round plus the break. Without durations use a bounded time window.
    const limit = Math.min(360,Math.max(240,(previous?.duration_seconds??0)+60,(battle.duration_seconds??0)+60));
    if (previous && (!key || key !== signature || !(gap > 0 && gap <= limit) || wins === 2 || losses === 2)) {
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

export function seriesInScope(series: MatchSeries[], battles: Battle[]) {
  const ids = new Set(battles.map(battle=>battle.id));
  return series.filter(match=>match.rounds.some(round=>ids.has(round.id)));
}

export function filteredSeries(series: MatchSeries[], battles: Battle[], filters: Filters, rankedOnly: boolean) {
  const scoped = filtered(battles,{...filters,start:'',end:''},rankedOnly);
  return seriesInScope(series,scoped).filter(match=>{
    if (!filters.start && !filters.end) return true;
    const day = localDay(match.latest.played_at);
    return (!filters.start || day >= filters.start) && (!filters.end || day <= filters.end);
  });
}
