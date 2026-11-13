import { localDay, normalize, stats } from './data';
import type { Battle } from './data';
import type { Progress } from './browser-store';
import { mapKey } from './external-comparison';

export const replayTags = [
  'Protegi a vantagem', 'Coordenei com o time', 'Ganhei a lane', 'Perdi a lane',
  'Entrei sozinho', 'Gastei o Super cedo', 'Perdi o objetivo',
] as const;
export type ReplayTag = typeof replayTags[number];
export type ReplayReview = { tag: ReplayTag; note: string };
export type TrainingPlan = { focus: string; completed: boolean; startedAt?: string; completedAt?: string };
export const MAP_MIN_GAMES = 10;
const FORM_SIZE = 10;
const SESSION_GAP = 60 * 60 * 1000;

export function mapPerformance(matches: Battle[]) {
  const byMap = new Map<string, Battle[]>();
  for (const match of matches) {
    if (!match.map_name) continue;
    const key = mapKey(match.map_name);
    const rows = byMap.get(key) ?? [];
    rows.push(match);
    byMap.set(key, rows);
  }
  return [...byMap].map(([key, rows]) => {
    rows.sort((a,b)=>Date.parse(b.played_at)-Date.parse(a.played_at));
    const decided = rows.filter(match=>match.result==='victory'||match.result==='defeat');
    return { key, name: rows[0].map_name!, mode: rows[0].mode, rows, summary: stats(rows),
      recent: stats(decided.slice(0,FORM_SIZE)), previous: stats(decided.slice(FORM_SIZE,FORM_SIZE*2)) };
  });
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

export function rankedSessions(matches: Battle[], readings: Progress[]) {
  const sessions: Battle[][] = [];
  const ordered = matches.filter(match=>match.ranked&&Number.isFinite(Date.parse(match.played_at)))
    .sort((a,b)=>Date.parse(a.played_at)-Date.parse(b.played_at));
  for (const match of ordered) {
    const last = sessions.at(-1)?.at(-1);
    if (!last || Date.parse(match.played_at)-Date.parse(last.played_at)>=SESSION_GAP ||
        localDay(match.played_at)!==localDay(last.played_at) || normalize(match.season)!==normalize(last.season)) sessions.push([]);
    sessions.at(-1)!.push(match);
  }
  const scores = readings.filter(reading=>reading.score!==null&&Number.isFinite(Date.parse(reading.at))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  let offset=0;
  return sessions.map(rows=>{
    const first=rows[0], last=rows.at(-1)!;
    const start=Date.parse(first.played_at), end=Date.parse(last.played_at);
    const observed: Progress[] = [];
    while(offset<scores.length&&Date.parse(scores[offset].at)<start) offset++;
    while(offset<scores.length&&Date.parse(scores[offset].at)<=end){
      const score=scores[offset++];
      if(normalize(first.season)===normalize(score.season)) observed.push(score);
    }
    const summary=stats(rows);
    return { first,last,summary,observed:observed.length,
      firstScore:observed[0]?.score??null, lastScore:observed.at(-1)?.score??null,
      peak:observed.length?observed.reduce((max,row)=>Math.max(max,row.score!),0):null };
  }).reverse();
}

export function trainingResults(matches: Battle[], plan: TrainingPlan) {
  const start=Date.parse(plan.startedAt??'');
  const end=plan.completedAt?Date.parse(plan.completedAt):Infinity;
  return stats(matches.filter(match=>{
    const at=Date.parse(match.played_at);
    return match.ranked&&at>=start&&at<=end;
  }));
}
