import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, Flame, TrendingUp } from 'lucide-react';
import { findMap, MapImage, ModeIcon, Portrait } from '@/components/game';
import type { ReactNode } from 'react';
import type { Battle } from '@/lib/data';
import { matchKd } from '@/lib/match-series';
import type { MatchElo, MatchSeries } from '@/lib/match-series';
import { dateTime, modeName, number, percent, resultName, stats } from '@/lib/data';

const marks = { victory: 'V', defeat: 'D', draw: 'E', unknown: '?' };

function ResultDot({ match, elo, onMatch }: {match:MatchSeries; elo?:MatchElo; onMatch:(battle:Battle)=>void}) {
  const id=useId();
  const button=useRef<HTMLButtonElement>(null);
  const [position,setPosition]=useState<{left:number;top:number;above:boolean}|null>(null);
  const {latest,rounds,wins,losses}=match;
  const result=match.result??'unknown';
  const label=rounds.length>1&&!match.result?'Resultado em aberto':resultName(match.result);
  const kd=matchKd(match);
  const kdEvidence=rounds.some(round=>round.kd?.reference);
  function open() {
    const rect=button.current?.getBoundingClientRect();
    if(!rect)return;
    const width=Math.min(278,window.innerWidth-16);
    const above=rect.top>=250;
    setPosition({left:Math.max(8,Math.min(window.innerWidth-width-8,rect.left+(rect.width-width)/2)),
      top:above?rect.top-7:rect.bottom+7,above});
  }
  const visible=position!==null;
  useEffect(()=>{
    if(!visible)return;
    const close=()=>setPosition(null);
    window.addEventListener('scroll',close,true);
    window.addEventListener('resize',close);
    return ()=>{window.removeEventListener('scroll',close,true);window.removeEventListener('resize',close);};
  },[visible]);
  const delta=elo?elo.after-elo.before:0;
  return <li><button ref={button} type="button" className={result}
    aria-label={`Abrir partida · ${label} · ${latest.player_brawler??'Brawler indisponível'} · ${latest.map_name??'Mapa indisponível'} · ${dateTime(latest.played_at)}`}
    aria-describedby={visible?id:undefined} onMouseEnter={open} onMouseLeave={()=>setPosition(null)} onFocus={open}
    onBlur={()=>setPosition(null)} onKeyDown={event=>{if(event.key==='Escape')setPosition(null);}}
    onClick={()=>{setPosition(null);onMatch(latest);}}>{marks[result]}</button>
    {position&&createPortal(<div id={id} role="tooltip" className="recent-match-preview" data-above={position.above}
      style={{left:position.left,top:position.top}}>
      <div className="preview-match-map"><MapImage map={findMap(latest.map_name,latest.event_id,latest.mode)}/></div>
      <div className="preview-match-info">
        <div className="preview-match-heading"><span className={`preview-result ${result}`}>{label}</span>{rounds.length>1&&<strong>{wins}–{losses}</strong>}</div>
        <strong>{latest.map_name??'Mapa indisponível'}</strong>
        <small className="image-label"><ModeIcon mode={latest.mode}/>{modeName(latest.mode)}</small>
        <div className="image-label preview-brawler"><Portrait name={latest.player_brawler}/><span>{latest.player_brawler??'Brawler indisponível'}
          <small>{dateTime(latest.played_at)}</small></span></div>
      </div>
      <div className="preview-match-metrics">
        <div><small><TrendingUp size={13}/> Elo</small><strong>{elo?`${delta>0?'+':''}${number(delta)}`:latest.rank_score!=null?number(latest.rank_score):'—'}</strong>
          <small>{elo?`${number(elo.before)} → ${number(elo.after)} · ${elo.reference?'Evidência':'Estimativa'}`:
            latest.rank_score!=null?`Pontuação · ${latest.score_source?'Evidência':'Supercell'}`:'Sem leitura isolada'}</small></div>
        <div><small><Crosshair size={13}/> K/D final</small><strong>{kd?`${number(kd.kills)} / ${number(kd.deaths)}`:'—'}</strong>
          <small>{kd?(kdEvidence?'Com evidência registrada':'Eliminações / mortes'):'Sem registro completo'}</small></div>
      </div>
    </div>,document.body)}
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
