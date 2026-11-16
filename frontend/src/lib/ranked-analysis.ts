import { normalize, orderByMatchCount, stats } from './data';
import { mapKey } from './external-comparison';
import { completedRankedSeries, seriesDuration, seriesPlayers, seriesRank, seriesSeason, sumRecorded } from './match-series';
import type { MatchSeries } from './match-series';
import { ordered } from './scouting';

type RankedMap = { id: string; name: string; mode: string|null; matches: MatchSeries[] };

export function rankedMaps(matches: MatchSeries[]) {
  const groups = new Map<string,RankedMap>();
  for (const match of matches) {
    const { map_name:name, mode } = match.latest;
    const key = mapKey(name);
    if (!name || !key || !completedRankedSeries(match)) continue;
    const id = JSON.stringify([normalize(mode),key]);
    const group = groups.get(id) ?? { id,name,mode,matches:[] };
    group.matches.push(match);
    groups.set(id,group);
  }
  return [...groups.values()].sort((a,b)=>b.matches.length-a.matches.length || a.name.localeCompare(b.name,'pt-BR'));
}

export function picksOnMap(matches: MatchSeries[]) {
  const groups = new Map<string,{ id:string; name:string; matches:MatchSeries[] }>();
  for (const match of matches) {
    const name = match.rounds.findLast(round=>normalize(round.player_brawler))?.player_brawler;
    if (!name) continue;
    const id = normalize(name);
    const group = groups.get(id) ?? { id,name,matches:[] };
    group.matches.push(match);
    groups.set(id,group);
  }
  const known = [...groups.values()].reduce((total,pick)=>total+pick.matches.length,0);
  const rows = [...groups.values()].map(pick=>({...pick,...stats(pick.matches),pickRate:pick.matches.length/known}))
    .sort((a,b)=>b.games-a.games || a.name.localeCompare(b.name,'pt-BR'));
  const effective = ordered(rows.filter(row=>row.decided>=3))[0];
  return { known, rows, frequency:rows[0], effective };
}

export function mapForReview(maps: ReturnType<typeof rankedMaps>) {
  return maps.map(map=>({...map,...stats(map.matches)})).filter(row=>row.losses>row.wins)
    .sort((a,b)=>(b.losses-b.wins)-(a.losses-a.wins) || b.games-a.games || a.name.localeCompare(b.name,'pt-BR'))[0];
}

export function opponentsInDefeats(matches: MatchSeries[]) {
  const groups = new Map<string,{ name:string; games:number; wins:number; losses:number; matches:MatchSeries[] }>();
  for (const match of matches) {
    const seen = new Set<string>();
    for (const player of match.latest.players) {
      const name = player.brawler;
      if (player.side!=='opponent' || !name) continue;
      const id = normalize(name);
      if (seen.has(id)) continue;
      seen.add(id);
      const group = groups.get(id) ?? {name,games:0,wins:0,losses:0,matches:[]};
      group.games++;
      if (match.result==='victory') group.wins++;
      if (match.result==='defeat') {
        group.losses++;
        group.matches.push(match);
      }
      groups.set(id,group);
    }
  }
  return orderByMatchCount([...groups.values()].filter(group=>group.losses>0),'losses');
}

// Call with a single map, mode and brawler cohort so the ranking only breaks ties inside that scope.
export function pairedVictory(matches: MatchSeries[], defeat: MatchSeries) {
  const season = normalize(seriesSeason(defeat));
  const rank = normalize(seriesRank(defeat)?.rank_label);
  const date = Date.parse(defeat.latest.played_at);
  return matches.filter(match=>match.result==='victory').map(match=>({
    match,
    sameSeason:Boolean(season && normalize(seriesSeason(match))===season),
    sameRank:Boolean(rank && normalize(seriesRank(match)?.rank_label)===rank),
    distance:Math.abs(Date.parse(match.latest.played_at)-date),
  })).sort((a,b)=>Number(b.sameSeason)-Number(a.sameSeason) || Number(b.sameRank)-Number(a.sameRank) || a.distance-b.distance)[0];
}

type Outcome = 'victory'|'defeat';
type MetricReading = { match:MatchSeries; value:number };

function seriesMeasurements(match: MatchSeries) {
  const players = seriesPlayers(match);
  const own = players.find(player=>player.side==='self');
  const seconds = seriesDuration(match);
  const perMinute = (value?:number)=>value===undefined || seconds===null || seconds<=0 ? undefined : value*60/seconds;
  const damage = own?.stats?.objective?.value;
  const team = own ? players.filter(player=>player.team_index===own.team_index) : [];
  const teamDamage = team.length===3 ? sumRecorded(team.map(player=>player.stats?.objective?.value)) : undefined;
  return {
    kills:perMinute(own?.stats?.kills), deaths:perMinute(own?.stats?.deaths),
    damageDealt:perMinute(own?.stats?.damage_dealt), damageTaken:perMinute(own?.stats?.damage_taken),
    healing:perMinute(own?.stats?.healing), safePerMinute:perMinute(damage), safeDamage:damage,
    safeShare:damage!==undefined && teamDamage ? damage/teamDamage : undefined,
  };
}

type Metric = { key:keyof ReturnType<typeof seriesMeasurements>; label:string; unit:'minute'|'series'|'share' };
const combatMetrics: Metric[] = [
  {key:'kills',label:'Eliminações',unit:'minute'}, {key:'deaths',label:'Mortes',unit:'minute'},
  {key:'damageDealt',label:'Dano causado',unit:'minute'}, {key:'damageTaken',label:'Dano recebido',unit:'minute'},
  {key:'healing',label:'Cura',unit:'minute'},
];
const heistMetrics: Metric[] = [
  {key:'safePerMinute',label:'Dano ao cofre',unit:'minute'}, {key:'safeDamage',label:'Dano ao cofre',unit:'series'},
  {key:'safeShare',label:'Parcela do dano da equipe ao cofre',unit:'share'},
];

export function compareSeriesResults(matches: MatchSeries[], mode: string|null) {
  const series = { victory:[] as MatchSeries[], defeat:[] as MatchSeries[] };
  const measurements = { victory:[] as ReturnType<typeof seriesMeasurements>[], defeat:[] as ReturnType<typeof seriesMeasurements>[] };
  for (const match of matches) {
    const {result} = match;
    if (!completedRankedSeries(match) || (result!=='victory' && result!=='defeat')) continue;
    series[result].push(match);
    measurements[result].push(seriesMeasurements(match));
  }
  const metrics = (normalize(mode)==='heist' ? [...combatMetrics,...heistMetrics] : combatMetrics).map(metric=>{
    const sample = (outcome: Outcome) => {
      const readings: MetricReading[] = measurements[outcome].flatMap((row,index)=>{
        const value = row[metric.key];
        return value===undefined ? [] : [{value,match:series[outcome][index]}];
      });
      return {readings,total:series[outcome].length,
        average:readings.length ? readings.reduce((sum,row)=>sum+row.value,0)/readings.length : null};
    };
    return {...metric,victory:sample('victory'),defeat:sample('defeat')};
  });
  return {metrics};
}
