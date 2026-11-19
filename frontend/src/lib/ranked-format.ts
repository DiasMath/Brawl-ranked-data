import type { Battle } from './data';
import ranks from './catalog/ranks.json';

export type RankedFormat = 'single'|'series'|'unknown';
const key=(value:string)=>value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

export function rankedFormat(battle:Battle):RankedFormat {
  if(!battle.ranked)return 'single';
  if(!Number.isFinite(Date.parse(battle.played_at)))return 'unknown';
  const label=!battle.rank_source&&battle.rank_label?key(battle.rank_label):'';
  const rank=ranks.find(row=>[row.key,row.label,String(row.id)].some(value=>key(value)===label));
  const byRank=rank?(rank.floor>=4500?'series':'single'):undefined;
  const score=!battle.score_source?battle.rank_score:null;
  const byScore=typeof score==='number'&&Number.isFinite(score)&&score>=0?(score>=4500?'series':'single'):undefined;
  if(byRank&&byScore&&byRank!==byScore)return 'unknown';
  const format=byRank??byScore;
  // The November rules are date-versioned. Do not reinterpret older lower-rank records.
  if(format==='single'&&Date.parse(battle.played_at)<Date.parse('2026-11-12T00:00:00Z'))return 'unknown';
  return format??'unknown';
}
