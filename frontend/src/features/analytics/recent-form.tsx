import { useState } from 'react';
import { Clock3, Crosshair, Flame, Star, TrendingUp } from 'lucide-react';
import { useDataTooltip } from '@/components/data-tooltip';
import { findMap, MapImage, ModeIcon, Portrait } from '@/components/game';
import type { ReactNode } from 'react';
import type { Battle } from '@/lib/data';
import { matchKd, seriesDuration } from '@/lib/match-series';
import type { MatchElo, MatchSeries } from '@/lib/match-series';
import { dateTime, durationLabel, modeName, number, percent, resultName, stats } from '@/lib/data';

const marks = { victory: 'V', defeat: 'D', draw: 'E', unknown: '?' };

function ResultDot({ match, elo, onMatch }: {match:MatchSeries; elo?:MatchElo; onMatch:(battle:Battle)=>void}) {
  const tooltip=useDataTooltip();
  const {latest,rounds,wins,losses}=match;
  const result=match.result??'unknown';
  const label=rounds.length>1&&!match.result?'Resultado em aberto':resultName(match.result);
  const kd=matchKd(match);
  const duration=seriesDuration(match);
  const star=latest.star_player?.name??latest.star_player?.tag;
  const delta=elo?elo.after-elo.before:0;
  const score=latest.score_source?null:latest.rank_score;
  return <li><button type="button" className={result}
    aria-label={`Abrir partida · ${label} · ${latest.player_brawler??'Brawler indisponível'} · ${latest.map_name??'Mapa indisponível'} · ${dateTime(latest.played_at)}`}
    {...tooltip.trigger(Boolean(tooltip.anchor))} onClick={()=>{tooltip.close();onMatch(latest);}}>{marks[result]}</button>
    {tooltip.render(<>
      <div className="preview-match-map"><MapImage map={findMap(latest.map_name,latest.event_id,latest.mode)}/></div>
      <div className="preview-match-info">
        <div className="preview-match-heading"><span className={`preview-result ${result}`}>{label}</span>{rounds.length>1&&<strong>{wins}–{losses}</strong>}</div>
        <strong>{latest.map_name??'Mapa indisponível'}</strong>
        <small className="image-label"><ModeIcon mode={latest.mode}/>{modeName(latest.mode)}</small>
        <div className="image-label preview-brawler"><Portrait name={latest.player_brawler}/><span>{latest.player_brawler??'Brawler indisponível'}
          <small>{dateTime(latest.played_at)}</small></span></div>
      </div>
      {(elo||score!=null||kd||duration!=null||star)&&<div className="preview-match-metrics">
        {(elo||score!=null)&&<div><small><TrendingUp size={13}/> Elo</small><strong>{elo?`${delta>0?'+':''}${number(delta)}`:number(score!)}</strong>
          <small>{elo?`${number(elo.before)} → ${number(elo.after)} · Estimativa`:'Pontuação · Supercell'}</small></div>}
        {kd&&<div><small><Crosshair size={13}/> K/D final</small><strong>{number(kd.kills)} / {number(kd.deaths)}</strong>
          <small>Eliminações / mortes</small></div>}
        {duration!=null&&<div><small><Clock3 size={13}/> Tempo de jogo</small><strong>{durationLabel(duration)}</strong></div>}
        {star&&<div><small><Star size={13}/> {rounds.length>1?'Craque da última rodada':'Craque da partida'}</small><strong>{star}</strong></div>}
      </div>}
    </>,'recent-match-preview')}
  </li>;
}

export function RecentForm({ matches, elo, onMatch, action }: {
  matches: MatchSeries[]; elo?:Map<string,MatchElo>; onMatch: (battle: Battle) => void; action?: ReactNode;
}) {
  const [limit, setLimit] = useState<5|10>(5);
  const recent = matches.slice(0,limit);
  const sample = stats(recent);
  const lead = recent[0]?.result;
  const firstDifferent = matches.findIndex(battle=>battle.result!==lead);
  const streak = lead==='victory'||lead==='defeat' ? (firstDifferent===-1?matches.length:firstDifferent) : 0;
  const streakLabel = lead==='victory' ? (streak===1?'vitória':'vitórias') : (streak===1?'derrota':'derrotas');
  return <section className="card recent-form">
    <div className="card-head"><div><h2><Flame size={17}/> Forma recente</h2>
      <p>{recent.length?`${number(recent.length)} ${recent.length===1?'partida':'partidas'} · mais recente à direita`:'Resultados do Ranqueado no recorte'}</p></div>
      {action}</div>
    {recent.length?<>
      <div className="recent-form-controls">
        <div className="view-tabs" role="group" aria-label="Quantidade de partidas recentes">
          <button type="button" aria-pressed={limit===5} onClick={()=>setLimit(5)}>Últimas 5</button>
          <button type="button" aria-pressed={limit===10} onClick={()=>setLimit(10)}>Últimas 10</button>
        </div>
        <div className="recent-form-legend" aria-label="Legenda">
          <span><b className="victory">V</b> Vitória</span><span><b className="defeat">D</b> Derrota</span>
          <span><b className="draw">E</b> Empate</span>
          {sample.games>sample.decided+sample.draws&&<span><b className="unknown">?</b> Sem resultado</span>}
        </div>
      </div>
      <ol className="recent-results" aria-label="Resultados em ordem cronológica">
        {[...recent].reverse().map(match=><ResultDot key={match.id} match={match} elo={elo?.get(match.id)} onMatch={onMatch}/>)}
      </ol>
      <div className="form-stats">
        <div><strong>{percent(sample.rate)}</strong><small>Win rate · {number(sample.decided)} decisivas</small></div>
        <div><strong>{number(sample.wins)} V · {number(sample.losses)} D · {number(sample.draws)} E</strong><small>Resultados na janela</small></div>
        <div><strong>{streak?`${number(streak)} ${streakLabel}`:'—'}</strong><small>Sequência no recorte</small></div>
      </div>
    </>:<p className="section-note">Sem partidas ranqueadas no recorte.</p>}
  </section>;
}
