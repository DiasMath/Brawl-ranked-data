import { localDay, normalize, stats } from './data';
import type { Battle } from './data';
import type { Progress } from './browser-store';
import { mapKey } from './external-comparison';
import { seriesBattle, seriesSeason } from './match-series';
import type { MatchSeries } from './match-series';

export const replayTags = [
  'Protegi a vantagem', 'Coordenei com o time', 'Ganhei a lane', 'Perdi a lane',
  'Entrei sozinho', 'Gastei o Super cedo', 'Perdi o objetivo',
] as const;
export type ReplayTag = typeof replayTags[number];
export type ReplayReview = { tag: ReplayTag; note: string };
export type TrainingScope = { map?: string; brawler?: string };
export type TrainingPlan = TrainingScope & { focus: string; completed: boolean; startedAt?: string; completedAt?: string };
export type ArchivedTrainingPlan = TrainingPlan & { archivedAt: string };
export const MAP_MIN_GAMES = 10;
const FORM_SIZE = 10;
const SESSION_GAP = 60 * 60 * 1000;

export function recentFormWindows(matches: Pick<Battle,'result'>[]) {
  const decided=matches.filter(match=>match.result==='victory'||match.result==='defeat');
  return {recent:stats(decided.slice(0,FORM_SIZE)), previous:stats(decided.slice(FORM_SIZE,FORM_SIZE*2))};
}

function battlesByMap(matches: Battle[]) {
  const byMap = new Map<string, Battle[]>();
  for (const match of matches) {
    if (!match.map_name) continue;
    const key = mapKey(match.map_name);
    const rows = byMap.get(key) ?? [];
    rows.push(match);
    byMap.set(key, rows);
  }
  return [...byMap];
}

export function mapPerformance(matches: Battle[]) {
  return battlesByMap(matches).map(([key, rows]) => {
    rows.sort((a,b)=>Date.parse(b.played_at)-Date.parse(a.played_at));
    return { key, name: rows[0].map_name!, mode: rows[0].mode, rows, summary: stats(rows), ...recentFormWindows(rows) };
  });
}

export function brawlerPerformance(matches: MatchSeries[]) {
  const picks=new Map<string,{label:string;matches:MatchSeries[]}>();
  const ordered=matches.slice().sort((a,b)=>b.latest.played_at.localeCompare(a.latest.played_at));
  let known=0;
  for(const match of ordered){
    const label=match.rounds.findLast(round=>normalize(round.player_brawler))?.player_brawler;
    if(!label)continue;
    const key=normalize(label);
    const group=picks.get(key);
    if(group)group.matches.push(match);
    else picks.set(key,{label,matches:[match]});
    known++;
  }
  const rows=[...picks].map(([key,pick])=>({
    key, label:pick.label, summary:stats(pick.matches), pickRate:pick.matches.length/known,
    ...recentFormWindows(pick.matches),
  }));
  return {known, total:matches.length, rows};
}

export function brawlerMapPerformance(matches: MatchSeries[], brawler: string) {
  return battlesByMap(matches.map(seriesBattle)).flatMap(([key,rows])=>{
    const known=rows.filter(row=>normalize(row.player_brawler));
    const picks=known.filter(row=>normalize(row.player_brawler)===brawler);
    if(!picks.length)return [];
    const {wins,losses,decided,rate}=stats(picks);
    return [{key,name:rows[0].map_name!,mode:rows[0].mode,wins,losses,games:decided,rate,picks:picks.length,known:known.length}];
  });
}

export function brawlerMatchups(matches: MatchSeries[], brawler: string, side:'ally'|'opponent') {
  const groups=new Map<string,{name:string;battles:Battle[]}>();
  const own=matches.map(seriesBattle).filter(battle=>normalize(battle.player_brawler)===brawler)
    .sort((a,b)=>b.played_at.localeCompare(a.played_at));
  let covered=0;
  for(const battle of own){
    const seen=new Set<string>();
    for(const player of battle.players){
      const name=player.brawler?.trim();
      if(player.side!==side||!name)continue;
      const key=normalize(name);
      if(seen.has(key))continue;
      seen.add(key);
      const group=groups.get(key);
      if(group)group.battles.push(battle);
      else groups.set(key,{name,battles:[battle]});
    }
    if(seen.size)covered++;
  }
  const rows=[...groups].map(([key,{name,battles}])=>{
    const {wins,losses,decided,rate}=stats(battles);
    return {key,name,wins,losses,games:decided,rate,
      victory:battles.find(battle=>battle.result==='victory'),
      defeat:battles.find(battle=>battle.result==='defeat')};
  });
  return {rows,covered,total:own.length};
}

export function reviewPair(rows: Battle[]) {
  const victory = rows.find(match=>match.result==='victory');
  const defeat = rows.find(match=>match.result==='defeat');
  const wins = new Map<string,Battle>(), losses = new Map<string,Battle>();
  for (const match of rows) {
    const brawler = normalize(match.player_brawler);
    if (!brawler) continue;
    const outcomes = match.result==='victory' ? wins : match.result==='defeat' ? losses : null;
    if (outcomes && !outcomes.has(brawler)) outcomes.set(brawler,match);
  }
  for (const match of rows) {
    const brawler = normalize(match.player_brawler);
    const win = wins.get(brawler), loss = losses.get(brawler);
    if ((win===match||loss===match)&&win&&loss) return {victory:win,defeat:loss};
  }
  return { victory, defeat };
}

export function rankedSessions(matches: MatchSeries[], readings: Progress[]) {
  const ordered = matches.filter(match=>match.latest.ranked).map(match=>{
    const first = match.rounds[0], last = match.latest;
    const season = seriesSeason(match);
    return { match, first, last, season, start:Date.parse(first.played_at), end:Date.parse(last.played_at) };
  }).filter(row=>Number.isFinite(row.start)&&Number.isFinite(row.end)).sort((a,b)=>a.start-b.start);
  const sessions: typeof ordered[] = [];
  for (const match of ordered) {
    const last = sessions.at(-1)?.at(-1);
    if (!last || match.start-last.end>=SESSION_GAP || localDay(match.last.played_at)!==localDay(last.last.played_at) ||
        normalize(match.season)!==normalize(last.season)) sessions.push([]);
    sessions.at(-1)!.push(match);
  }
  const scores = readings.filter(reading=>reading.score!==null&&Number.isFinite(Date.parse(reading.at))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  let offset=0;
  return sessions.map(rows=>{
    const {first,start,season}=rows[0];
    const {last,end}=rows.at(-1)!;
    const observed: Progress[] = [];
    while(offset<scores.length&&Date.parse(scores[offset].at)<start) offset++;
    while(offset<scores.length&&Date.parse(scores[offset].at)<=end){
      const score=scores[offset++];
      if(normalize(season)===normalize(score.season)) observed.push(score);
    }
    const summary=stats(rows.map(row=>row.match));
    return { first,last,summary,observed:observed.length,
      firstScore:observed[0]?.score??null, lastScore:observed.at(-1)?.score??null,
      peak:observed.length?observed.reduce((max,row)=>Math.max(max,row.score!),0):null };
  }).reverse();
}

export function updateTrainingPlan(plan: TrainingPlan, previous: TrainingPlan | undefined, at: string) {
  const same = previous && previous.focus===plan.focus && mapKey(previous.map??null)===mapKey(plan.map??null) &&
    normalize(previous.brawler)===normalize(plan.brawler);
  const training:TrainingPlan={...plan,startedAt:same?previous.startedAt??at:at,
    completedAt:plan.completed?(same?previous.completedAt??at:at):undefined};
  const archived:ArchivedTrainingPlan|undefined=previous&&!same?{...previous,archivedAt:at}:undefined;
  return {training,archived};
}

export function trainingProgress(matches: MatchSeries[], plan: TrainingPlan | ArchivedTrainingPlan) {
  const start=Date.parse(plan.startedAt??'');
  const cutoff=plan.completedAt??('archivedAt' in plan?plan.archivedAt:undefined);
  const end=cutoff?Date.parse(cutoff):Infinity;
  const map=mapKey(plan.map??null);
  const brawler=normalize(plan.brawler);
  const after:MatchSeries[]=[];
  const before:MatchSeries[]=[];
  for(const match of matches){
    if(!match.latest.ranked || (map && mapKey(match.latest.map_name)!==map))continue;
    const pick=match.rounds.findLast(round=>normalize(round.player_brawler))?.player_brawler;
    if(brawler && normalize(pick)!==brawler)continue;
    const first=Date.parse(match.rounds[0].played_at);
    const last=Date.parse(match.latest.played_at);
    if(first>=start&&last<=end)after.push(match);
    else if(last<start&&(match.result==='victory'||match.result==='defeat'))before.push(match);
  }
  const observed=stats(after);
  const reference=stats(before.sort((a,b)=>b.latest.played_at.localeCompare(a.latest.played_at)).slice(0,observed.decided));
  return {observed, reference};
}
