import { normalize, orderByMatchCount, stats } from './data';
import { recentFormWindows } from './coaching';
import { mapKey } from './external-comparison';
import { completedRankedSeries, seriesBattle, seriesDuration, seriesPlayers, seriesRank, seriesSeason, sumRecorded } from './match-series';
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

export function seriesMeasurements(match: MatchSeries) {
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

export function openingConversion(matches: MatchSeries[], groupBy:'map'|'brawler') {
  const groups = new Map<string,{
    id:string; name:string; mode:string|null;
    victory:MatchSeries[]; defeat:MatchSeries[];
  }>();
  for (const match of matches) {
    if (!completedRankedSeries(match) || match.rounds.some(round=>!round.result) || match.rounds.at(-1)?.result!==match.result) continue;
    const opening = match.rounds[0].result;
    if (opening!=='victory' && opening!=='defeat') continue;
    const {map_name:map,mode} = match.latest;
    const name = groupBy==='map' ? map : match.rounds.findLast(round=>normalize(round.player_brawler))?.player_brawler;
    if (!name || !normalize(name)) continue;
    const id = groupBy==='map' ? JSON.stringify([normalize(mode),mapKey(name)]) : normalize(name);
    const group = groups.get(id) ?? {id,name,mode:groupBy==='map'?mode:null,victory:[],defeat:[]};
    group[opening].push(match);
    groups.set(id,group);
  }
  return [...groups.values()].map(group=>({...group, games:group.victory.length+group.defeat.length,
    afterWin:stats(group.victory), afterLoss:stats(group.defeat),
  })).sort((a,b)=>b.games-a.games || a.name.localeCompare(b.name,'pt-BR'));
}

export function heistObjectivePoints(matches: MatchSeries[]) {
  const points: { match:MatchSeries; damage:number; objective:number }[] = [];
  let eligible = 0;
  for (const match of matches) {
    if (normalize(match.latest.mode)!=='heist' || !completedRankedSeries(match)) continue;
    eligible++;
    const { damageDealt, safePerMinute } = seriesMeasurements(match);
    if (damageDealt!==undefined && safePerMinute!==undefined) {
      points.push({match,damage:damageDealt,objective:safePerMinute});
    }
  }
  return { points, eligible };
}

export function opponentCompositions(matches: MatchSeries[], size:1|2|3) {
  const groups = new Map<string,{id:string; names:string[]; games:number; wins:number; losses:number; defeats:MatchSeries[]}>();
  let covered = 0;
  let coveredLosses = 0;
  let losses = 0;
  for (const match of matches) {
    if (!completedRankedSeries(match)) continue;
    const lost = match.result==='defeat';
    if (lost) losses++;
    const opponents = match.latest.players.filter(player=>player.side==='opponent').map(player=>player.brawler?.trim()??'');
    if (opponents.length!==3 || opponents.some(name=>!name)) continue;
    covered++;
    if (lost) coveredLosses++;
    const names = opponents.sort((a,b)=>normalize(a).localeCompare(normalize(b),'pt-BR'));
    const [first,second,third] = names;
    const combinations = size===3 ? [names] : size===2 ? [[first,second],[first,third],[second,third]] : names.map(name=>[name]);
    const seen = new Set<string>();
    for (const combo of combinations) {
      const id = JSON.stringify(combo.map(normalize));
      if (seen.has(id)) continue;
      seen.add(id);
      const group = groups.get(id) ?? {id,names:combo,games:0,wins:0,losses:0,defeats:[]};
      group.games++;
      if (lost) {
        group.losses++;
        group.defeats.push(match);
      } else group.wins++;
      groups.set(id,group);
    }
  }
  return {rows:orderByMatchCount([...groups.values()].filter(row=>row.losses),'losses'),covered,coveredLosses,losses};
}

function objectiveAverage(matches:MatchSeries[]) {
  let total = 0;
  let coverage = 0;
  for (const match of matches) {
    if (normalize(match.latest.mode)!=='heist') continue;
    const { safePerMinute } = seriesMeasurements(match);
    if (safePerMinute===undefined) continue;
    total += safePerMinute;
    coverage++;
  }
  return { coverage, average:coverage?total/coverage:null };
}

export function personalMapPicks(matches:MatchSeries[]) {
  return ordered(picksOnMap(matches).rows.filter(pick=>pick.decided>=3).map(pick=>{
    const chronological = pick.matches.slice().sort((a,b)=>b.latest.played_at.localeCompare(a.latest.played_at));
    return {...pick,...recentFormWindows(chronological),objective:objectiveAverage(chronological)};
  }));
}

export function matchupBaseline(matches:MatchSeries[], brawler:string, side:'ally'|'opponent') {
  const conditions = new Map<string,Set<string>>();
  let context:string|undefined;
  const groups = new Map<string,MatchSeries[]>();
  const own:MatchSeries[] = [];
  for (const match of matches) {
    const battle = seriesBattle(match);
    if (normalize(battle.player_brawler)!==brawler || !completedRankedSeries(match)) continue;
    if (!battle.map_name || !battle.mode) return null;
    const current = JSON.stringify([mapKey(battle.map_name),normalize(battle.mode)]);
    if (context && current!==context) return null;
    context = current;
    const teammates = battle.players.filter(player=>player.side===side);
    if (teammates.length!==(side==='ally'?2:3) || teammates.some(player=>!normalize(player.brawler))) continue;
    const names = new Set(teammates.map(player=>normalize(player.brawler)));
    conditions.set(match.id,names);
    own.push(match);
    for (const name of names) {
      const group = groups.get(name) ?? [];
      group.push(match);
      groups.set(name,group);
    }
  }
  const map = new Map([...groups].map(([name,withBrawler])=>{
    const withoutBrawler = own.filter(match=>!conditions.get(match.id)?.has(name));
    return [name,{
      withBrawler:stats(withBrawler),withoutBrawler:stats(withoutBrawler),
      withObjective:side==='ally'?objectiveAverage(withBrawler):null,
      withoutObjective:side==='ally'?objectiveAverage(withoutBrawler):null,
    }] as const;
  }));
  return { rows:map, covered:own.length };
}
