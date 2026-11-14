import { PagedTable } from '@/components/data-table';
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, Flag, Gauge, Target, TrendingUp, Trophy } from 'lucide-react';
import { rankedSessions } from '@/lib/coaching';
import type { LocalData, Progress } from '@/lib/browser-store';
import { dateTime, localDay, normalize, number, percent, stats } from '@/lib/data';
import type { Dataset, Filters } from '@/lib/data';
import type { MatchSeries } from '@/lib/match-series';
import { gameRank, nextRank, RankArt, referenceRank, TrophyArt } from '@/components/game';
import { useDataTooltip } from '@/components/data-tooltip';

export function profileProgress(profile: Dataset['profile']): Progress | null {
  if (!profile || (profile.trophies == null && !profile.rank_label && profile.rank_score == null)) return null;
  return { id: 'profile', at: profile.fetched_at, trophies: profile.trophies, score: profile.rank_score ?? null,
    rank: profile.rank_label ?? null, season: profile.season ?? null, method: 'api', source: 'Perfil da API Supercell' };
}

export function progressSeries(local: LocalData) {
  const rows = local.progress.filter(row=>row.method==='api');
  const { profile, matches } = local.dataset;
  const reading = profileProgress(profile);
  const latest = rows.findLast(row => row.method === 'api' && row.id.startsWith('server:'));
  if (reading && (!latest || latest.trophies !== reading.trophies || latest.rank !== reading.rank ||
    latest.score !== reading.score || latest.season !== reading.season)) rows.push(reading);
  for (const match of matches) {
    const rank=match.rank_source?null:match.rank_label;
    const score=match.score_source?null:match.rank_score;
    if (!match.ranked || (!rank && score === null)) continue;
    rows.push({ id: match.id, at: match.played_at, trophies: null, score, rank,
      season:match.season_source?null:match.season, source:'Histórico da API Supercell', method:'api' });
  }
  return rows.sort((a,b) => Date.parse(a.at)-Date.parse(b.at));
}

export function progressionWindow(rows: Progress[], filters: Filters) {
  return rows.filter(row => {
    const day = localDay(row.at);
    return (!filters.start || day >= filters.start) && (!filters.end || day <= filters.end)
      && (!filters.season || normalize(row.season) === normalize(filters.season));
  });
}

export function rankProgress(rows: Progress[]) {
  const current = rows.findLast(row => row.score !== null || row.rank);
  const score = current?.score ?? null;
  const rank = current?.rank ?? referenceRank(score)?.label;
  const division = current?.rank ? gameRank(current.rank) : referenceRank(score);
  const candidate = nextRank(current?.rank,score);
  const next = candidate && (score === null || candidate.floor > score) ? candidate : undefined;
  const remaining = next && score !== null ? next.floor - score : null;
  const fraction = next && division && score !== null && score >= division.floor
    ? (score - division.floor) / (next.floor - division.floor) : null;
  return {current, score, rank, next, remaining, fraction};
}

export function RankGoal({ data, onProgress }: {data:ReturnType<typeof rankProgress>; onProgress?:()=>void}) {
  const {next,remaining,fraction}=data;
  return <section className="card rank-goal">
    <div className="rank-goal-top"><div><small>Próxima divisão de referência</small><h2>{next?.label ?? 'Meta indisponível'}</h2></div>
      {next && <RankArt rank={next.label}/>}</div>
    {next?<><div className="rank-goal-values"><strong>{remaining===null?'—':number(remaining)+' pts'}</strong>
      <span>{remaining===null?'Pontuação atual indisponível':'restantes'} · alvo {number(next.floor)}</span></div>
      {fraction!==null&&<progress aria-label="Progresso dentro da divisão" max={1} value={fraction}/>}</>:
      <p className="section-note">{data.current?'Você pode definir um alvo em pontos no plano de subida.':'Sincronize para consultar o Ranqueado.'}</p>}
    {onProgress&&<button className="text-button" onClick={onProgress}>Abrir progressão <ArrowRight size={14}/></button>}
  </section>;
}

function observedPace(matches:MatchSeries[]) {
  const days=[...new Set(matches.map(match=>localDay(match.latest.played_at)))].sort();
  const span=days.length ? (Date.parse(days.at(-1)!)-Date.parse(days[0]))/86400000+1 : 0;
  return {days:days.length,span,perDay:span?matches.length/span:null};
}

export function TrendChart({ rows, field, label, note }: { rows: Progress[]; field: 'trophies'|'score'; label: string; note: string }) {
  const tooltip=useDataTooltip();
  const points = rows.filter(row => row[field] !== null);
  const index=points.findIndex(point=>point.id===tooltip.anchor?.getAttribute('data-reading'));
  const active=points[index];
  const prior=points[index-1];
  const delta=active&&prior&&(field==='trophies'||(active.season&&normalize(active.season)===normalize(prior.season)))
    ? active[field]!-prior[field]! : null;
  const min = points.reduce((v,p) => Math.min(v, p[field]!), Infinity);
  const max = points.reduce((v,p) => Math.max(v, p[field]!), -Infinity);
  const start = points.length ? Date.parse(points[0].at) : 0;
  const finish = points.length ? Date.parse(points.at(-1)!.at) : 0;
  const coords = points.map((p) => [
    start === finish ? 270 : 61 + 399 * (Date.parse(p.at) - start) / (finish - start),
    max === min ? 85 : 144 - (p[field]! - min) * 114 / (max - min),
  ]);
  const paths: number[][][] = [];
  for (const [i,point] of points.entries()) {
    if(i===0 || (field==='score' && normalize(point.season)!==normalize(points[i-1].season))) paths.push([]);
    paths.at(-1)!.push(coords[i]);
  }
  const change = points.length >= 2 && paths.length===1 ? points.at(-1)![field]! - points[0][field]! : null;
  const Direction=change!==null&&change<0?ArrowDownRight:ArrowUpRight;
  return <section className="card trend">
    <div className="card-head"><div><h2>{field === 'trophies' ? <Trophy size={17} /> : <TrendingUp size={17} />}{label}</h2><p>{note}</p></div>
      {change !== null && <span className={`trend-delta ${change < 0 ? 'negative' : ''}`}><Direction size={14} />{change > 0 ? '+' : ''}{number(change)}</span>}</div>
    {points.length ? <svg className="progress-chart" viewBox="0 0 490 181" role="group" aria-label={label}>
      {[30,68,106,144].map((y,i) => <g key={y}><line x1="60" x2="467" y1={y} y2={y} />
        {(min !== max || i === 1) && <text x="7" y={y + 4}>{number(Math.round(max - (max - min) * i / 3))}</text>}</g>)}
      {paths.map((segment,i)=>segment.length>1&&<polyline key={i} points={segment.map(p=>p.join(',')).join(' ')}/>)}
      {coords.map(([x,y],i) => <g key={points[i].id} data-reading={points[i].id} tabIndex={0} className="progress-point"
        aria-label={`${dateTime(points[i].at)} · ${number(points[i][field]!)} ${field==='trophies'?'troféus':'pontos'}`}
        {...tooltip.trigger(active===points[i])}>
        <circle className="point-hit" cx={x} cy={y} r="10"/><circle className="point-dot" cx={x} cy={y} r="4"/>
      </g>)}
      <text x="60" y="171">{localDay(points[0].at)}</text>
      {points.length > 1 && <text x="467" y="171" textAnchor="end">{localDay(points.at(-1)!.at)}</text>}
    </svg> : <div className="trend-empty">
      {field === 'trophies' ? <TrophyArt /> : <RankArt />}
      <strong>{field === 'trophies' ? 'Aguardando primeira leitura' : 'Pontuação indisponível'}</strong>
      <span>Sincronize para buscar uma leitura do perfil.</span>
    </div>}
    {points.length>0&&<p className="trend-foot">{number(points.length)} {points.length===1?'leitura':'leituras'} · máximo observado {number(max)}
      {paths.length>1&&' · quebras por temporada ou temporada ausente'}</p>}
    {active&&tooltip.render(<>
      <div className="chart-tooltip-heading">{field==='trophies'?<TrophyArt/>:<RankArt rank={active.rank}/>}
        <div><small>{dateTime(active.at)}</small><strong>{label}</strong></div></div>
      <div className="preview-match-metrics">
        <div><small>{field==='trophies'?'Troféus':'Pontos'}</small><strong>{number(active[field]!)}</strong></div>
        {delta!==null&&<div><small>Desde a última leitura</small><strong data-tone={delta>=0?'win':'loss'}>{delta>0?'+':''}{number(delta)}</strong></div>}
      </div>
      <p className="chart-tooltip-source">{[field==='score'?active.rank:null,field==='score'?active.season:null,active.source].filter(Boolean).join(' · ')}</p>
    </>,'chart-tooltip')}
  </section>;
}

function SessionHistory({matches,readings}: {matches:MatchSeries[];readings:Progress[]}) {
  const sessions=useMemo(()=>rankedSessions(matches,readings),[matches,readings]);
  const hasElo=sessions.some(session=>session.observed>0);
  return <section className="card account-card"><div className="card-head"><div><h2><CalendarClock size={17}/> Sessões do Ranqueado</h2>
    <p>Uma pausa de uma hora, a virada do dia em Brasília ou a mudança de temporada inicia outra sessão.</p></div></div>
    {sessions.length?<><PagedTable label="Sessões do Ranqueado" rows={sessions} headings={<><th>Sessão</th><th>Resultados</th><th>Win rate</th>
      {hasElo&&<><th>Primeiro e último Elo observado</th><th>Pico observado</th></>}</>} renderRow={session=><tr key={session.first.id}>
      <td>{dateTime(session.first.played_at)}{session.last.id!==session.first.id&&<small>Até {dateTime(session.last.played_at)}</small>}</td>
      <td>{session.summary.wins} V · {session.summary.losses} D · {session.summary.draws} E
        <small>{session.summary.games} {session.summary.games===1?'partida':'partidas'}
          {session.summary.games>session.summary.decided+session.summary.draws&&' · inclui resultado em aberto'}</small></td>
      <td>{percent(session.summary.rate)}</td>{hasElo&&<><td>{session.firstScore===null?null:number(session.firstScore)}
        {session.observed>1&&session.lastScore!==null?` → ${number(session.lastScore)}`:''}{session.observed>0&&<small>{session.observed} leituras</small>}</td>
      <td>{session.peak===null?null:number(session.peak)}</td></>}
    </tr>}/>
    {hasElo&&<p className="section-note">O Elo usa as leituras feitas no intervalo da sessão, com a mesma temporada registrada.</p>}
    </>:
    <p className="section-note">Nenhuma partida ranqueada no recorte.</p>}
  </section>;
}

export function Progression({ local, filters, matches }: {
  local: LocalData; filters: Filters; matches:MatchSeries[];
}) {
  const rows = progressSeries(local);
  const summary = rankProgress(rows);
  const {current, score, rank:currentRank, next:suggested}=summary;
  const trophy=rows.findLast(row=>row.trophies!==null);
  const [target, setTarget] = useState('');
  const [horizon, setHorizon] = useState('7');
  const [pace, setPace] = useState('');
  const [gain, setGain] = useState('');
  const [loss, setLoss] = useState('');
  const [winRate, setWinRate] = useState('');
  const recent = matches.filter(match=>match.result==='victory'||match.result==='defeat').slice(0,30);
  const sample = stats(recent);
  const activity = observedPace(matches);
  const paceRounded=activity.perDay===null?null:Number(activity.perDay.toPrecision(2));
  const decisivePace=activity.span?stats(matches).decided/activity.span:0;
  const plannerPace=decisivePace>0?Number(decisivePace.toPrecision(2)):null;
  const goal = target ? Number(target) : (suggested?.floor ?? null);
  const p = winRate.trim() && Number(winRate) >= 0 && Number(winRate) <= 100 ? Number(winRate) / 100 : null;
  const net = p !== null && Number(gain) > 0 && loss.trim() && Number(loss) >= 0 ? p * Number(gain) - (1-p) * Number(loss) : null;
  const remaining = goal !== null && score !== null && Number.isFinite(goal) ? Math.max(0, goal - score) : null;
  const games = remaining === 0 ? 0 : remaining !== null && net !== null && net > 0 ? Math.ceil(remaining / net) : null;
  const days = games !== null && Number(pace) > 0 ? Math.ceil(games / Number(pace)) : null;
  const required = games !== null && Number(horizon) > 0 ? Math.ceil(games / Number(horizon)) : null;
  const visible = progressionWindow(rows,filters);
  const trophyRows = filters.season ? progressionWindow(rows,{...filters,season:''}) : visible;
  const scoreRows = visible.filter(row => row.score !== null && (!current?.season || normalize(row.season)===normalize(current.season) || filters.season));
  const bestScore = scoreRows.reduce<number|null>((best,row)=>Math.max(best??0,row.score!),null);
  const breakEven = Number(gain)>0 && loss.trim() && Number(loss)>=0 ? Number(loss)/(Number(gain)+Number(loss)) : null;
  const milestones=visible.filter(row=>row.rank).filter((row,i,list)=>i===0
    || normalize(row.rank)!==normalize(list[i-1].rank) || normalize(row.season)!==normalize(list[i-1].season)).slice(-5).reverse();

  return <div className="stack">
    <div className="rank-summary-grid">
      <section className="progress-banner card"><RankArt rank={currentRank} /><div><span className="eyebrow">Última leitura do Ranqueado</span>
        <h2>{currentRank ?? 'Ranqueado'}</h2>
        <p>{current ? [score===null?null:number(score)+' pontos',dateTime(current.at),current.season].filter(Boolean).join(' · ')
          : 'Sincronize a conta para consultar o perfil.'}</p>
        {current&&<p className="rank-source">{currentRank&&!current.rank?'Divisão de referência · ':''}{current.source}</p>}</div></section>
      <RankGoal data={summary}/>
    </div>
    <div className="overview-metrics progress-metrics">
      <div className="card game-metric"><TrophyArt/><div><small>Troféus da conta</small><strong>{trophy?.trophies!=null?number(trophy.trophies):'—'}</strong>
        <span>{trophy?dateTime(trophy.at):'Sem leitura do perfil'}</span></div></div>
      {bestScore!==null&&<div className="card game-metric"><span className="game-metric-icon violet"><TrendingUp size={22}/></span><div><small>Pico de pontos observado</small>
        <strong>{number(bestScore)}</strong><span>{filters.season||current?.season||'Leituras no período'}</span></div></div>}
      <div className="card game-metric"><span className="game-metric-icon green"><Gauge size={22}/></span><div><small>Ranqueadas por dia</small>
        <strong>{paceRounded===null?'—':number(paceRounded)}</strong><span>{activity.span?
          `${number(matches.length)} ${matches.length===1?'ranqueada':'ranqueadas'} em ${number(activity.span)} ${activity.span===1?'dia':'dias'}`:
          'Sem partidas no recorte'}</span></div></div>
      <div className="card game-metric"><span className="game-metric-icon orange"><CalendarClock size={22}/></span><div><small>Dias com partidas</small>
        <strong>{activity.span?number(activity.days):'—'}</strong><span>{activity.span?'No intervalo entre a primeira e a última':'Sem partidas no recorte'}</span></div></div>
    </div>
    <div className={scoreRows.length?'two-col equal':'stack'}><TrendChart rows={trophyRows} field="trophies" label="Subida de troféus" note="Total da conta por data, independente da temporada" />
      {scoreRows.length>0&&<TrendChart rows={scoreRows} field="score" label="Pontos do Ranqueado" note={filters.season || current?.season || 'Leituras em ordem cronológica'} />}</div>
    <section className="card planner"><div className="card-head"><div><h2><Flag size={17} /> Plano de subida</h2>
      <p>Estimativa com base no ritmo, na taxa de vitória e nos ganhos e perdas informados.</p></div><span className="tag hypothesis">Hipótese</span></div>
      <div className="form-grid">
        <label>Meta em pontos<input type="number" min="0" value={target} onChange={e => setTarget(e.target.value)} placeholder={suggested ? String(suggested.floor) : 'Informe a meta'} /></label>
        <label>Prazo em dias<input type="number" min="1" value={horizon} onChange={e => setHorizon(e.target.value)} /></label>
        <label>Partidas decisivas por dia<input type="number" min="0" step="any" value={pace} onChange={e => setPace(e.target.value)} /></label>
        <label>Win rate esperado (%)<input type="number" min="0" max="100" step="0.1" value={winRate} onChange={e => setWinRate(e.target.value)} /></label>
        <label>Pontos por vitória<input type="number" min="1" value={gain} onChange={e => setGain(e.target.value)} /></label>
        <label>Pontos perdidos por derrota<input type="number" min="0" value={loss} onChange={e => setLoss(e.target.value)} /></label>
      </div>
      <div className="planner-notes">
        {suggested && !target && <span>Próxima divisão de referência: {suggested.label}. O alvo em pontos é editável.</span>}
        {plannerPace!==null&&<button className="text-button" onClick={()=>setPace(String(plannerPace))}>Usar {number(plannerPace)} decisivas/dia do histórico</button>}
        {sample.rate !== null && <button className="text-button" onClick={() => setWinRate(String(Math.round(sample.rate! * 1000)/10))}>
          Usar {percent(sample.rate)} do histórico ({number(sample.decided)} {sample.decided===1?'partida decisiva':'partidas decisivas'})</button>}
      </div>
      <div className="planner-grid">
        {[[Target,'Pontos restantes',remaining],[Flag,'Partidas estimadas',games],[CalendarClock,'Dias no seu ritmo',days],[TrendingUp,'Partidas/dia no prazo',required]].map(([item,title,value]) => {
          const Icon = item as typeof Target;
          return <div key={String(title)}><Icon size={17} /><small>{String(title)}</small><strong>{typeof value === 'number' ? number(value) : '—'}</strong></div>;
        })}
      </div>
      {(net!==null||breakEven!==null)&&<div className="planner-assumptions">
        {net!==null&&<span>Saldo esperado <b>{net>0?'+':''}{number(Math.round(net*10)/10)} pts por partida decisiva</b></span>}
        {breakEven!==null&&<span>Win rate de equilíbrio <b>{percent(breakEven)}</b></span>}
      </div>}
      <p className="section-note">{net !== null && net <= 0 ? 'O saldo esperado é zero ou negativo com esses valores.' :
        'A estimativa conta partidas decisivas (vitórias e derrotas). O Elo real varia conforme adversários e resultado da série.'}</p>
    </section>
    <SessionHistory matches={matches} readings={visible}/>
    {milestones.length>0&&<section className="card"><div className="card-head"><div><h2><Flag size={17}/> Divisões registradas</h2>
      <p>Últimas mudanças de divisão nas leituras do período</p></div></div>
      <ol className="rank-milestones">{milestones.map(row=><li key={row.id}><RankArt rank={row.rank}/><div>
        <strong>{row.rank}</strong><small>{dateTime(row.at)}{row.season?' · '+row.season:''}</small></div></li>)}</ol></section>}
    <section className="card"><div className="card-head"><div><h2>Histórico de leituras</h2><p>Perfil e histórico da Supercell</p></div></div>
      {visible.length ? <PagedTable label="Histórico de leituras" rows={[...visible].reverse()} pageKey={JSON.stringify(filters)} headings={<><th>Data</th><th>Troféus</th><th>Pontos</th><th>Rank</th><th>Temporada</th><th>Fonte</th></>} renderRow={row => <tr key={row.id}><td>{dateTime(row.at)}</td><td>{row.trophies ?? '—'}</td>
          <td>{row.score ?? '—'}</td><td>{row.rank ?? '—'}</td><td>{row.season ?? '—'}</td><td>{row.source}</td></tr>}/>
        : <p className="section-note">As leituras aparecem aqui após a sincronização.</p>}</section>
  </div>;
}
