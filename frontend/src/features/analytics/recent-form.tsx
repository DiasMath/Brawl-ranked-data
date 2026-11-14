import { useState } from 'react';
import { Flame } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Battle } from '@/lib/data';
import type { MatchSeries } from '@/lib/match-series';
import { dateTime, number, percent, resultName, stats } from '@/lib/data';

const marks = { victory: 'V', defeat: 'D', draw: 'E', unknown: '?' };

export function RecentForm({ matches, onMatch, action }: {
  matches: MatchSeries[]; onMatch: (battle: Battle) => void; action?: ReactNode;
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
        {[...recent].reverse().map(match=>{
          const { latest, rounds, wins, losses } = match;
          const result=match.result??'unknown';
          const description=[rounds.length>1&&!match.result?'Resultado em aberto':resultName(match.result),rounds.length>1?`${wins}–${losses} em rodadas`:null,
            latest.player_brawler,latest.map_name,dateTime(latest.played_at)].filter(Boolean).join(' · ');
          return <li key={match.id}><button type="button" className={result} title={description}
            aria-label={`Abrir partida · ${description}`} onClick={()=>onMatch(latest)}>{marks[result]}</button></li>;
        })}
      </ol>
      <div className="form-stats">
        <div><strong>{percent(sample.rate)}</strong><small>Win rate · {number(sample.decided)} decisivas</small></div>
        <div><strong>{number(sample.wins)} V · {number(sample.losses)} D · {number(sample.draws)} E</strong><small>Resultados na janela</small></div>
        <div><strong>{streak?`${number(streak)} ${streakLabel}`:'—'}</strong><small>Sequência no recorte</small></div>
      </div>
    </>:<p className="section-note">Sem partidas ranqueadas no recorte.</p>}
  </section>;
}
