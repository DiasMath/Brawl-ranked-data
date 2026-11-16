import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BarChart3, MapPinned, Target } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { findMap, MapImage, Portrait } from '@/components/game';
import { dateTime, modeName, normalize, number, percent, resultName } from '@/lib/data';
import type { MatchSeries } from '@/lib/match-series';
import { compareSeriesResults, mapForReview, opponentsInDefeats, picksOnMap, rankedMaps } from '@/lib/ranked-analysis';

type ReviewMap = NonNullable<ReturnType<typeof mapForReview>>;
type RankedMap = ReturnType<typeof rankedMaps>[number];
type Metric = ReturnType<typeof compareSeriesResults>['metrics'][number];
type Outcome = 'victory'|'defeat';
type Evidence = { id:string; title:string; rows:{ match:MatchSeries; value?:number }[]; metric?:Metric };
type ComparisonSelection = { pick:string }|{ outcome:Outcome; metric:Metric['key'] }|'all';
const outcomes: { key:Outcome; label:string }[] = [{key:'victory',label:'Vitórias'},{key:'defeat',label:'Derrotas'}];
const decimal = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
const metricLabel = (metric:Metric)=>`${metric.label}${metric.unit==='minute'?' por minuto':metric.unit==='series'?' por série':''}`;
const metricValue = (metric:Metric,value:number)=>metric.unit==='share'?percent(value):decimal.format(value);
const sampleLabel = (known:number,total:number)=>`${number(known)} de ${number(total)} ${total===1?'série':'séries'}`;

function EvidenceTable({ evidence, onOpen }: { evidence:Evidence; onOpen:(id:string)=>void }) {
  const {title,rows,metric} = evidence;
  const ref = useRef<HTMLElement>(null);
  useEffect(()=>{
    ref.current?.focus({preventScroll:true});
    ref.current?.scrollIntoView({block:'nearest'});
  },[evidence.id]);
  return <section ref={ref} tabIndex={-1} className="analysis-evidence" aria-label={title}>
    <h3>{title}</h3>
    <PagedTable label={`Tabela · ${title}`} rows={rows} pageKey={evidence.id} unit={['série','séries']} pageSize={5}
      headings={<><th>Data</th><th>Brawler</th><th>Resultado</th>{metric&&<th>{metricLabel(metric)}</th>}<th>Abrir</th></>}
      renderRow={({match,value})=><tr key={match.id}>
        <td>{dateTime(match.latest.played_at)}</td><td>{match.rounds.findLast(round=>round.player_brawler)?.player_brawler??'—'}</td>
        <td>{resultName(match.result)} · {match.wins}–{match.losses}</td>
        {metric&&<td>{value===undefined?'—':metricValue(metric,value)}</td>}
        <td><button className="text-button" onClick={()=>onOpen(match.latest.id)} aria-label={`Abrir série de ${dateTime(match.latest.played_at)}`}>Ver partida</button></td>
      </tr>}/>
  </section>;
}

function MapComparison({ map,pickMap,preferredBrawler,onOpen }: {
  map:RankedMap; pickMap:RankedMap; preferredBrawler:string; onOpen:(id:string)=>void;
}) {
  const [choice,setChoice] = useState('');
  const [selection,setSelection] = useState<{id:string; target:ComparisonSelection}|null>(null);
  const scoped = useMemo(()=>picksOnMap(map.matches),[map]);
  const picks = useMemo(()=>picksOnMap(pickMap.matches),[pickMap]);
  const active = scoped.rows.find(row=>row.id===choice) ?? scoped.rows.find(row=>row.id===normalize(preferredBrawler))
    ?? scoped.rows.find(row=>row.wins && row.losses) ?? scoped.frequency;
  const comparison = useMemo(()=>compareSeriesResults(active?.matches??[],map.mode),[active,map.mode]);
  const withMetrics = comparison.metrics.some(row=>row.victory.readings.length||row.defeat.readings.length);
  const selectedEvidence = (() : Evidence|null => {
    if (!selection) return null;
    const {id,target} = selection;
    if (target==='all') return active ? {id,title:`Séries comparadas de ${active.name}`,rows:active.matches.map(match=>({match}))} : null;
    if ('pick' in target) {
      const pick = picks.rows.find(row=>row.id===target.pick);
      return pick ? {id,title:`Séries de ${pick.name} em ${map.name}`,rows:pick.matches.map(match=>({match}))} : null;
    }
    const metric = comparison.metrics.find(row=>row.key===target.metric);
    return metric?.[target.outcome].readings.length ? {id,title:`${target.outcome==='victory'?'Vitórias':'Derrotas'} · ${metricLabel(metric)}`,
      rows:metric[target.outcome].readings,metric} : null;
  })();

  function show(id:string,target:ComparisonSelection) {
    setSelection(current=>current?.id===id?null:{id,target});
  }

  return <>
    <section className="analysis-section" aria-label="Vitórias × derrotas">
      <div className="analysis-section-head"><div><h3>Vitórias × derrotas</h3>
        <p className="muted">{active?`${active.name} · ${map.name} · ${number(active.wins)} V · ${number(active.losses)} D`:'Aguardando um brawler identificado no mapa.'}</p></div>
        {active&&<label>Brawler da comparação<select value={active.id} onChange={event=>{setChoice(event.target.value);setSelection(null);}}>
          {scoped.rows.map(row=><option key={row.id} value={row.id}>{row.name} · {number(row.games)} {row.games===1?'série':'séries'}</option>)}
        </select></label>}
      </div>
      {active&&<>
        {(!active.wins||!active.losses)&&<p className="section-note analysis-message">A diferença aparece quando há vitórias e derrotas com a métrica registrada.</p>}
        {!withMetrics&&<p className="section-note analysis-message">As séries deste recorte ainda não têm estatísticas completas para as métricas abaixo.</p>}
        <div className="table-wrap analysis-metrics" role="region" aria-label="Métricas de vitórias e derrotas" tabIndex={0}><table>
          <thead><tr><th scope="col">Métrica</th>{outcomes.map(({key,label})=><th scope="col" key={key}>{label}</th>)}<th scope="col">Diferença (V − D)</th></tr></thead>
          <tbody>{comparison.metrics.map(metric=>{
            const diff = metric.victory.average===null || metric.defeat.average===null ? null : metric.victory.average-metric.defeat.average;
            return <tr key={metric.key}><th scope="row">{metricLabel(metric)}</th>{outcomes.map(({key,label})=>{
              const sample=metric[key], id=`${active.id}:${key}:${metric.key}`;
              const coverage=sampleLabel(sample.readings.length,sample.total);
              return <td key={key}><strong>{sample.average===null?'—':metricValue(metric,sample.average)}</strong>
                {sample.readings.length?<button className="text-button" aria-pressed={selectedEvidence?.id===id}
                  aria-label={`Ver séries de ${label.toLowerCase()} · ${metricLabel(metric)} · ${coverage}`}
                  onClick={()=>show(id,{outcome:key,metric:metric.key})}>{coverage}</button>:<small>{coverage}</small>}
              </td>;
            })}<td>{diff===null?'—':`${diff>0?'+':''}${metric.unit==='share'?`${decimal.format(diff*100)} p.p.`:decimal.format(diff)}`}</td></tr>;
          })}</tbody>
        </table></div>
        <p className="muted">Cada série tem o mesmo peso. As taxas por minuto usam a duração somada das rodadas. O cofre aparece em Roubo e a parcela da equipe exige dados de todos os integrantes.</p>
        <button className="text-button" aria-pressed={selectedEvidence?.id===`${active.id}:all`} onClick={()=>show(`${active.id}:all`,'all')}>Ver todas as séries comparadas</button>
      </>}
    </section>
    <section className="analysis-section" aria-label="Pick frequente × pick efetivo">
      <h3>Pick frequente × pick efetivo</h3>
      <p className="muted">{sampleLabel(picks.known,pickMap.matches.length)} com pick identificado. A frequência usa todos os brawlers do mapa. O pick mais efetivo considera a taxa de vitória e o tamanho da amostra.</p>
      <div className="analysis-picks">
        {[{role:'Mais escolhido',pick:picks.frequency},{role:'Mais efetivo · mínimo de 3 séries',pick:picks.effective}].map(({role,pick})=><div key={role}>
          <small>{role}</small>
          {pick?<><strong className="image-label"><Portrait name={pick.name}/>{pick.name}</strong>
            <span><b>{percent(pick.pickRate)}</b> dos picks · <b>{percent(pick.rate)}</b> de vitórias</span>
            <span>{number(pick.games)} {pick.games===1?'série':'séries'} · {number(pick.wins)} V · {number(pick.losses)} D</span>
            <button className="text-button" aria-pressed={selectedEvidence?.id===`pick:${pick.id}`}
              aria-label={`Ver séries de ${pick.name} · ${role}`} onClick={()=>show(`pick:${pick.id}`,{pick:pick.id})}>Ver séries</button></>:<span>{picks.known?'Aguardando um brawler com três séries no mapa.':'Aguardando picks identificados.'}</span>}
        </div>)}
      </div>
    </section>
    {selectedEvidence&&<EvidenceTable evidence={selectedEvidence} onOpen={onOpen}/>}
  </>;
}

function ReviewDetails({ map,onAnalyze,onOpen }: { map:ReviewMap; onAnalyze:()=>void; onOpen:(id:string)=>void }) {
  const [selection,setSelection] = useState('');
  const picks = picksOnMap(map.matches).rows.slice(0,3);
  const opponents = opponentsInDefeats(map.matches).slice(0,3);
  const pick = picks.find(row=>selection===`pick:${row.id}`);
  const opponent = opponents.find(row=>selection===`opponent:${row.name}`);
  const matches = pick?.matches ?? opponent?.matches ?? (selection==='losses' ? map.matches.filter(match=>match.result==='defeat') : []);
  const title = pick ? `${pick.name} · séries no mapa` : opponent ? `Derrotas contra ${opponent.name}` : `Derrotas em ${map.name}`;
  const show = (id:string)=>setSelection(current=>current===id?'':id);
  return <Card title="Mapa para revisar" icon={Target} className="ranked-analysis"
    sub="Mapa com o maior saldo de derrotas no recorte."
    action={<button className="button small subtle" onClick={onAnalyze}>Analisar mapa <ArrowRight size={14}/></button>}>
    <div className="analysis-review-map"><MapImage map={findMap(map.name,null,map.mode)}/><div><strong>{map.name}</strong>
      <small>{modeName(map.mode)} · {number(map.wins)} V · {number(map.losses)} D · saldo −{number(map.losses-map.wins)}</small></div></div>
    <div className="analysis-picks analysis-review-groups">
      <div><h3>Seus picks mais usados</h3>{picks.length?picks.map(pick=><button className="text-button image-label" key={pick.id}
        aria-pressed={selection===`pick:${pick.id}`} onClick={()=>show(`pick:${pick.id}`)}>
        <Portrait name={pick.name}/><span>{pick.name}<small>{number(pick.wins)} V · {number(pick.losses)} D · {percent(pick.rate)} de vitórias</small></span>
      </button>):<span>Sem picks identificados.</span>}</div>
      <div><h3>Adversários nas derrotas</h3>{opponents.length?opponents.map(opponent=><button className="text-button image-label" key={normalize(opponent.name)}
        aria-pressed={selection===`opponent:${opponent.name}`} onClick={()=>show(`opponent:${opponent.name}`)}>
        <Portrait name={opponent.name}/><span>{opponent.name}<small>{number(opponent.matches.length)} de {number(map.losses)} derrotas</small></span>
      </button>):<span>Sem adversários identificados nas derrotas.</span>}</div>
    </div>
    <p className="section-note"><button className="text-button" aria-pressed={selection==='losses'}
      onClick={()=>show('losses')}>Ver derrotas do mapa</button></p>
    {matches.length>0&&<EvidenceTable evidence={{id:selection,title,rows:matches.map(match=>({match}))}} onOpen={onOpen}/>}
  </Card>;
}

export function RankedAnalysis({ matches,pickMatches,initialMap,preferredBrawler,onOpen }: {
  matches:MatchSeries[]; pickMatches:MatchSeries[]; initialMap:string; preferredBrawler:string; onOpen:(id:string)=>void;
}) {
  const [selected,setSelected] = useState(initialMap);
  const analysis = useRef<HTMLDivElement>(null);
  const maps = useMemo(()=>rankedMaps(matches),[matches]);
  const pickMaps = useMemo(()=>pickMatches===matches ? maps : rankedMaps(pickMatches),[matches,maps,pickMatches]);
  const map = maps.find(row=>row.id===selected) ?? maps[0];
  const pickMap = pickMaps.find(row=>row.id===map?.id) ?? map;
  const review = mapForReview(maps);
  if (!map || !pickMap) return <Card title="Análise das séries" icon={BarChart3}>
    <p className="section-note">Nenhuma série ranqueada concluída com mapa identificado neste recorte.</p>
  </Card>;
  return <>
    <div ref={analysis} className="ranked-analysis-anchor"><Card title="Análise das séries" icon={BarChart3} className="ranked-analysis"
      sub="Séries ranqueadas concluídas no período e nos filtros selecionados."
      action={<label>Mapa da análise<select value={map.id} onChange={event=>setSelected(event.target.value)}>
        {maps.map(row=><option key={row.id} value={row.id}>{row.name} · {modeName(row.mode)}</option>)}
      </select></label>}>
      <MapComparison key={JSON.stringify([map.id,preferredBrawler])}
        map={map} pickMap={pickMap} preferredBrawler={preferredBrawler} onOpen={onOpen}/>
    </Card></div>
    {review&&<ReviewDetails key={review.id} map={review} onAnalyze={()=>{
      setSelected(review.id);
      analysis.current?.scrollIntoView({block:'start'});
    }} onOpen={onOpen}/>}
  </>;
}

export function OverviewMapReview({ matches,onReview }: { matches:MatchSeries[]; onReview:(map:string)=>void }) {
  const review = mapForReview(rankedMaps(matches));
  if (!review) return null;
  return <Card title="Mapa para revisar" icon={MapPinned} className="ranked-analysis overview-map-review"
    sub={`${number(review.wins)} V · ${number(review.losses)} D · maior saldo de derrotas no recorte`}
    action={<button className="button small subtle" onClick={()=>onReview(review.id)}>Ver análise <ArrowRight size={14}/></button>}>
    <div className="analysis-review-map"><MapImage map={findMap(review.name,null,review.mode)}/><div><strong>{review.name}</strong>
      <small>{modeName(review.mode)} · {number(review.games)} {review.games===1?'série':'séries'}</small></div></div>
  </Card>;
}
