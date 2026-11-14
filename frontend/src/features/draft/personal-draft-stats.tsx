import { useMemo, useState } from 'react';
import { draftStats, normalize, number } from '@/lib/data';
import type { Filters } from '@/lib/data';
import type { MetaMatchup } from '@/lib/browser-store';
import { mapKey } from '@/lib/external-comparison';
import { seriesBattle, seriesSeason } from '@/lib/match-series';
import type { MatchSeries } from '@/lib/match-series';
import { VisualRanking } from '@/features/meta/meta-dashboard';
import { AccountBans } from '@/features/meta/external-account';
import { CounterFinder } from './draft-lab';

export function PersonalDraftStats({ matches, filters, imported }: {
  matches:MatchSeries[]; filters:Filters; imported:MetaMatchup[];
}) {
  const [season,setSeason]=useState('');
  const history=useMemo(()=>matches.map(match=>({battle:seriesBattle(match),season:seriesSeason(match)})),[matches]);
  const seasons=useMemo(()=>new Map(history.flatMap(row=>row.season?[[normalize(row.season),row.season] as const]:[])),[history]);
  const active=seasons.has(season)?season:'';
  const map=mapKey(filters.map_name);
  const rows=useMemo(()=>history.filter(row=>(!active||normalize(row.season)===active)&&
    (!map||mapKey(row.battle.map_name)===map)).map(row=>row.battle),[history,active,map]);
  const picks=useMemo(()=>draftStats(rows),[rows]);
  const brawler=normalize(filters.player_brawler);
  const rankedPicks=picks.rows.filter(row=>row.picks>0&&(!brawler||normalize(row.label)===brawler));
  return <div className="stack">
    <section className="card"><div className="card-head">
      <div><h2>Picks, bans e counters da conta</h2>
        <p>{number(rows.length)} {rows.length===1?'partida':'partidas'} · {filters.map_name||'Todos os mapas'}</p></div>
      <label>Temporada da conta<select value={active} onChange={event=>setSeason(event.target.value)}>
        <option value="">Todo o meu histórico</option>
        {[...seasons].map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
    </div></section>
    <div className="two-col equal">
      <VisualRanking title="Meus picks" metric="pick" sub={`${number(picks.picks)} ${picks.picks===1?'partida':'partidas'} com pick identificado`}
        rows={rankedPicks.map(row=>({name:row.label,value:row.picks/picks.picks,detail:`${number(row.picks)} de ${number(picks.picks)} ${picks.picks===1?'partida':'partidas'}`}))}
        empty="Nenhum pick próprio identificado neste recorte."/>
      <AccountBans matches={rows} selectedMap={filters.map_name||null}/>
    </div>
    <CounterFinder matches={rows} mode="" map={filters.map_name} filters={filters} imported={imported}/>
  </div>;
}
