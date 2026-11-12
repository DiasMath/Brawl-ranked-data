import { useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, Flag, Gauge, Plus, Target, TrendingUp, Trophy } from 'lucide-react';
import type { LocalData, Progress } from '@/lib/browser-store';
import { dateTime, localDay, normalize, number, percent, stats } from '@/lib/data';
import type { Battle, Dataset, Filters } from '@/lib/data';
import { gameRank, nextRank, RankArt, referenceRank, TrophyArt } from '@/components/game';

export function profileProgress(profile: Dataset['profile']): Progress | null {
  if (!profile || (profile.trophies == null && !profile.rank_label && profile.rank_score == null)) return null;
  return { id: 'profile', at: profile.fetched_at, trophies: profile.trophies, score: profile.rank_score ?? null,
    rank: profile.rank_label ?? null, season: profile.season ?? null, method: 'api', source: 'Perfil da API Supercell' };
}

export function progressSeries(local: LocalData) {
  const rows = [...local.progress];
  const { profile, matches } = local.dataset;
  const reading = profileProgress(profile);
  const latest = rows.findLast(row => row.method === 'api' && row.id.startsWith('server:'));
  if (reading && (!latest || latest.trophies !== reading.trophies || latest.rank !== reading.rank ||
    latest.score !== reading.score || latest.season !== reading.season)) rows.push(reading);
  for (const match of matches) {
    if (!match.ranked || (!match.rank_label && match.rank_score === null)) continue;
    rows.push({ id: match.id, at: match.played_at, trophies: null, score: match.rank_score, rank: match.rank_label,
      season: match.season, source: match.score_reference ?? match.rank_reference ?? 'Histórico da API Supercell',
      method: match.score_source || match.rank_source ? 'manual' : 'api' });
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
      <p className="section-note">{data.current?'Você pode definir um alvo em pontos no plano de subida.':'Registre sua divisão ou os pontos exibidos no jogo.'}</p>}
    {onProgress&&<button className="text-button" onClick={onProgress}>Abrir progressão <ArrowRight size={14}/></button>}
  </section>;
}

function observedPace(matches:Battle[]) {
  const days=[...new Set(matches.map(b=>localDay(b.played_at)))].sort();
  const span=days.length ? (Date.parse(days.at(-1)!)-Date.parse(days[0]))/86400000+1 : 0;
  return {days:days.length,span,perDay:span?matches.length/span:null};
}

export function TrendChart({ rows, field, label, note }: { rows: Progress[]; field: 'trophies'|'score'; label: string; note: string }) {
  const points = rows.filter(row => row[field] !== null);
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
    {points.length ? <svg className="progress-chart" viewBox="0 0 490 181" role="img" aria-label={label}>
      {[30,68,106,144].map((y,i) => <g key={y}><line x1="60" x2="467" y1={y} y2={y} />
        {(min !== max || i === 1) && <text x="7" y={y + 4}>{number(Math.round(max - (max - min) * i / 3))}</text>}</g>)}
      {paths.map((segment,i)=>segment.length>1&&<polyline key={i} points={segment.map(p=>p.join(',')).join(' ')}/>)}
      {coords.map(([x,y],i) => <circle key={points[i].id} cx={x} cy={y} r="4"><title>{dateTime(points[i].at)} · {number(points[i][field]!)}</title></circle>)}
      <text x="60" y="171">{localDay(points[0].at)}</text>
      {points.length > 1 && <text x="467" y="171" textAnchor="end">{localDay(points.at(-1)!.at)}</text>}
    </svg> : <div className="trend-empty">
      {field === 'trophies' ? <TrophyArt /> : <RankArt />}
      <strong>{field === 'trophies' ? 'Aguardando primeira leitura' : 'Pontuação indisponível'}</strong>
      <span>{field === 'trophies' ? 'Sincronize para registrar os troféus do perfil.' : 'Registre os pontos exibidos no jogo.'}</span>
    </div>}
    {points.length>0&&<p className="trend-foot">{number(points.length)} {points.length===1?'leitura':'leituras'} · máximo observado {number(max)}
      {paths.length>1&&' · quebras por temporada ou temporada ausente'}</p>}
  </section>;
}

export function Progression({ local, filters, matches, onSave }: {
  local: LocalData; filters: Filters; matches:Battle[]; onSave: (row: Progress) => Promise<void>;
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
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const recent = [...matches].sort((a,b)=>Date.parse(b.played_at)-Date.parse(a.played_at)).slice(0,30);
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

  async function submit(form: FormData) {
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const at = value('at') ? new Date(value('at')) : new Date();
    if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 60000) { setFeedback('Informe uma data válida até agora.'); return; }
    const trophies = value('trophies') ? Number(value('trophies')) : null;
    const points = value('score') ? Number(value('score')) : null;
    if (trophies === null && points === null && !value('rank')) { setFeedback('Informe troféus, pontos ou divisão.'); return; }
    setSaving(true);
    try {
      await onSave({ id: crypto.randomUUID(), at: at.toISOString(), trophies, score: points, rank: value('rank') || null,
        season: value('season') || null, source: value('source'), method: 'manual' });
      setShowForm(false); setFeedback('Leitura salva neste navegador.');
    } catch { setFeedback('Não foi possível salvar a leitura.'); }
    finally { setSaving(false); }
  }

  return <div className="stack">
    <div className="rank-summary-grid">
      <section className="progress-banner card"><RankArt rank={currentRank} /><div><span className="eyebrow">Última leitura do Ranqueado</span>
        <h2>{currentRank ?? 'Rank atual indisponível'}</h2>
        <p>{current ? `${score===null?'Pontuação indisponível':number(score)+' pontos'} · ${dateTime(current.at)}${current.season?' · '+current.season:''}`
          : 'Sincronize a conta ou registre uma leitura do jogo.'}</p>
        {current&&<p className="rank-source">{currentRank&&!current.rank?'Divisão de referência · ':''}{current.source}</p>}</div>
        <button className="button primary" onClick={() => setShowForm(v => !v)} aria-expanded={showForm}><Plus size={16} /> Registrar leitura</button></section>
      <RankGoal data={summary}/>
    </div>
    {feedback && <p className="feedback" role="status">{feedback}</p>}
    {showForm && <section className="card account-card"><div className="card-head"><div><h2>Leitura do jogo</h2><p>Registre apenas valores observados no perfil ou no resultado.</p></div></div>
      <form className="form-grid" onSubmit={e => { e.preventDefault(); void submit(new FormData(e.currentTarget)); }}>
        <label>Data e hora local<input type="datetime-local" name="at" /></label>
        <label>Troféus<input type="number" name="trophies" min="0" max="10000000" /></label>
        <label>Pontos do Ranqueado<input type="number" name="score" min="0" max="1000000" /></label>
        <label>Rank e divisão<input name="rank" placeholder="Ex.: Diamante II" maxLength={60} /></label>
        <label>Temporada<input name="season" maxLength={100} /></label>
        <label>Referência<input name="source" required maxLength={180} placeholder="Ex.: tela de Ranqueado do jogo" /></label>
        <button className="button primary" disabled={saving}>Salvar leitura</button>
      </form></section>}
    <div className="overview-metrics progress-metrics">
      <div className="card game-metric"><TrophyArt/><div><small>Troféus da conta</small><strong>{trophy?.trophies!=null?number(trophy.trophies):'—'}</strong>
        <span>{trophy?dateTime(trophy.at):'Sem leitura do perfil'}</span></div></div>
      <div className="card game-metric"><span className="game-metric-icon violet"><TrendingUp size={22}/></span><div><small>Pico de pontos observado</small>
        <strong>{bestScore===null?'—':number(bestScore)}</strong><span>{filters.season||current?.season||'Leituras no período'}</span></div></div>
      <div className="card game-metric"><span className="game-metric-icon green"><Gauge size={22}/></span><div><small>Ranqueadas por dia</small>
        <strong>{paceRounded===null?'—':number(paceRounded)}</strong><span>{activity.span?number(matches.length)+' ranqueadas em '+number(activity.span)+' dias':'Sem partidas no recorte'}</span></div></div>
      <div className="card game-metric"><span className="game-metric-icon orange"><CalendarClock size={22}/></span><div><small>Dias com partidas</small>
        <strong>{activity.span?number(activity.days):'—'}</strong><span>{activity.span?'No intervalo entre a primeira e a última':'Sem partidas no recorte'}</span></div></div>
    </div>
    <div className="two-col equal"><TrendChart rows={trophyRows} field="trophies" label="Subida de troféus" note="Total da conta por data, independente da temporada" />
      <TrendChart rows={scoreRows} field="score" label="Pontos do Ranqueado" note={filters.season || current?.season || 'Leituras em ordem cronológica'} /></div>
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
          Usar {percent(sample.rate)} do histórico ({number(sample.decided)} registros decisivos)</button>}
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
    {milestones.length>0&&<section className="card"><div className="card-head"><div><h2><Flag size={17}/> Divisões registradas</h2>
      <p>Últimas mudanças de divisão nas leituras do período</p></div></div>
      <ol className="rank-milestones">{milestones.map(row=><li key={row.id}><RankArt rank={row.rank}/><div>
        <strong>{row.rank}</strong><small>{dateTime(row.at)}{row.season?' · '+row.season:''}</small></div></li>)}</ol></section>}
    <section className="card"><div className="card-head"><div><h2>Histórico de leituras</h2><p>Perfil, Ranqueado e registros do jogo</p></div></div>
      {visible.length ? <div className="table-wrap"><table><thead><tr><th>Data</th><th>Troféus</th><th>Pontos</th><th>Rank</th><th>Temporada</th><th>Fonte</th></tr></thead>
        <tbody>{visible.slice().reverse().slice(0,60).map(row => <tr key={row.id}><td>{dateTime(row.at)}</td><td>{row.trophies ?? '—'}</td>
          <td>{row.score ?? '—'}</td><td>{row.rank ?? '—'}</td><td>{row.season ?? '—'}</td><td>{row.source}</td></tr>)}</tbody></table></div>
        : <p className="section-note">As leituras aparecem aqui após sincronização ou registro manual.</p>}</section>
  </div>;
}
