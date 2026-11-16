import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BarChart3, MapPinned, Target } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { findMap, MapImage, Portrait } from '@/components/game';
import { dateTime, durationLabel, modeName, normalize, number, percent, resultName } from '@/lib/data';
import { seriesDuration } from '@/lib/match-series';
import type { MatchSeries } from '@/lib/match-series';
import { compareSeriesResults, mapForReview, opponentsInDefeats, pairedVictory, picksOnMap, rankedMaps } from '@/lib/ranked-analysis';
import { PerformanceKpis } from './performance-kpis';

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

export function EvidenceTable({ evidence, onOpen }: { evidence:Evidence; onOpen:(id:string)=>void }) {
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

function PairedReview({ matches,mode,onOpen }: { matches:MatchSeries[]; mode:string|null; onOpen:(id:string)=>void }) {
  const [selected,setSelected] = useState('');
  const defeats=matches.filter(match=>match.result==='defeat');
  const defeat=defeats.find(match=>match.id===selected)??defeats[0];
  const pair=defeat&&pairedVictory(matches,defeat);
  const metrics=pair&&compareSeriesResults([pair.match,defeat],mode).metrics.filter(row=>row.victory.average!==null||row.defeat.average!==null);
  return <section className="analysis-section" aria-label="Revisão pareada">
    <div className="analysis-section-head"><div><h3>Revisão pareada</h3>
      <p className="muted">Vitória comparável no mesmo mapa, modo e brawler.</p></div>
      {defeat&&<label>Derrota para revisar<select value={defeat.id} onChange={event=>setSelected(event.target.value)}>
        {defeats.map(match=><option key={match.id} value={match.id}>{dateTime(match.latest.played_at)} · {match.wins}–{match.losses}</option>)}
      </select></label>}
    </div>
    {pair?<>
      <p className="muted">{pair.sameSeason?'Mesma temporada · ':''}{pair.sameRank?'Mesmo rank · ':''}Vitória mais próxima entre as opções com o mesmo nível de correspondência.</p>
      <div className="analysis-picks pair-series">
        {[pair.match,defeat].map(match=>{
          const duration=seriesDuration(match);
          return <div key={match.id} data-result={match.result}><strong>{resultName(match.result)} · {match.wins}–{match.losses}</strong>
            <small>{dateTime(match.latest.played_at)}{duration!==null&&` · ${durationLabel(duration)}`}</small>
            <ol aria-label="Resultados por rodada" className="pair-rounds">{match.rounds.map((round,index)=><li key={round.id}
              title={`Rodada ${index+1} · ${resultName(round.result)}`} aria-label={`Rodada ${index+1} · ${resultName(round.result)}`}
              data-result={round.result}>{round.result==='victory'?'V':round.result==='defeat'?'D':round.result==='draw'?'E':'—'}</li>)}</ol>
            <div className="pair-lineup">{(['ally','opponent'] as const).map(side=><div key={side}>
              <small>{side==='ally'?'Sua equipe':'Adversários'}</small>
              {match.latest.players.filter(player=>player.side===side||(side==='ally'&&player.side==='self')).map(player=><span key={player.player_tag} title={player.brawler??undefined}>
                <Portrait name={player.brawler} id={player.brawler_id} alt={player.brawler??'Brawler indisponível'}/>
              </span>)}
            </div>)}</div>
            <button className="text-button" onClick={()=>onOpen(match.latest.id)}>Abrir {resultName(match.result).toLocaleLowerCase('pt-BR')}</button>
          </div>;
        })}
      </div>
      {!!metrics?.length&&<div className="pair-chart" role="group" aria-label="Métricas das duas séries">
        {metrics.map(metric=>{
          const maximum=Math.max(metric.victory.average??0,metric.defeat.average??0)||1;
          return <div className="pair-chart-row" key={metric.key}><strong>{metricLabel(metric)}</strong>
            {outcomes.map(({key,label})=>{
              const value=metric[key].average;
              return <div key={key} data-result={key} className="pair-chart-bar"><span>{label==='Vitórias'?'Vitória':'Derrota'}</span>
                <span aria-hidden="true" className="analysis-track"><i style={{width:`${(value??0)/maximum*100}%`}}/></span>
                <b>{value===null?'—':metricValue(metric,value)}</b></div>;
            })}
          </div>;
        })}
      </div>}
    </>:<>
      <p className="muted">{defeat?'Nenhuma vitória comparável para a derrota selecionada.':'Nenhuma derrota deste brawler no recorte.'}</p>
      {defeat&&<button className="text-button" onClick={()=>onOpen(defeat.latest.id)}>Abrir derrota</button>}
    </>}
  </section>;
}

function MapComparison({ map,pickMap,preferredBrawler,view,onOpen }: {
  map:RankedMap; pickMap:RankedMap; preferredBrawler:string; view:'review'|'draft'; onOpen:(id:string)=>void;
}) {
  const [choice,setChoice] = useState('');
  const [selection,setSelection] = useState<{id:string; target:ComparisonSelection}|null>(null);
  const scoped = useMemo(()=>picksOnMap(map.matches),[map]);
  const picks = useMemo(()=>picksOnMap(pickMap.matches),[pickMap]);
  const active = scoped.rows.find(row=>row.id===choice) ?? scoped.rows.find(row=>row.id===normalize(preferredBrawler))
    ?? scoped.rows.find(row=>row.wins && row.losses) ?? scoped.frequency;
  const comparison = useMemo(()=>compareSeriesResults(view==='review'?active?.matches??[]:[],map.mode),[active,map.mode,view]);
  const measured = new Set(comparison.metrics.flatMap(metric=>[...metric.victory.readings,...metric.defeat.readings].map(row=>row.match.id))).size;
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
    {view==='review'&&<><div className="performance-review-grid"><section className="analysis-section" aria-label="Vitórias × derrotas">
      <div className="analysis-section-head"><div><h3>Vitórias × derrotas</h3>
        <p className="muted">{active?`${active.name} · ${map.name} · ${number(active.wins)} V · ${number(active.losses)} D`:'Aguardando um brawler identificado no mapa.'}</p></div>
        {active&&<label>Brawler da comparação<select value={active.id} onChange={event=>{setChoice(event.target.value);setSelection(null);}}>
          {scoped.rows.map(row=><option key={row.id} value={row.id}>{row.name} · {number(row.games)} {row.games===1?'série':'séries'}</option>)}
        </select></label>}
      </div>
      {active&&<>
        <PerformanceKpis label="Indicadores da comparação" items={[
          {label:'Séries',value:number(active.games)},
          {label:'Win rate',value:percent(active.rate),detail:`${number(active.wins)} V · ${number(active.losses)} D`},
          {label:'Com métricas',value:`${number(measured)} / ${number(active.games)}`,detail:'Ao menos uma métrica exibida'},
        ]}/>
        {(!active.wins||!active.losses)&&<p className="section-note analysis-message">A diferença aparece quando há vitórias e derrotas com a métrica registrada.</p>}
        {!measured&&<p className="section-note analysis-message">As séries deste recorte ainda não têm estatísticas completas para as métricas abaixo.</p>}
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
    {active&&<PairedReview key={active.id} matches={active.matches} mode={map.mode} onOpen={onOpen}/>}</div>
    {selectedEvidence&&<EvidenceTable evidence={selectedEvidence} onOpen={onOpen}/>}</>}
    {view==='draft'&&<><section className="analysis-section" aria-label="Pick frequente × pick efetivo">
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
    {selectedEvidence&&<EvidenceTable evidence={selectedEvidence} onOpen={onOpen}/>}</>}
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
        <Portrait name={opponent.name}/><span>{opponent.name}<small>{number(opponent.games)} séries · {number(opponent.losses)} de {number(map.losses)} derrotas</small></span>
      </button>):<span>Sem adversários identificados nas derrotas.</span>}</div>
    </div>
    <p className="section-note"><button className="text-button" aria-pressed={selection==='losses'}
      onClick={()=>show('losses')}>Ver derrotas do mapa</button></p>
    {matches.length>0&&<EvidenceTable evidence={{id:selection,title,rows:matches.map(match=>({match}))}} onOpen={onOpen}/>}
  </Card>;
}

export function PerformanceMapReview({matches,onAnalyze,onOpen}: {
  matches:MatchSeries[]; onAnalyze:(map:string)=>void; onOpen:(id:string)=>void;
}) {
  const review=useMemo(()=>mapForReview(rankedMaps(matches)),[matches]);
  return review?<ReviewDetails key={review.id} map={review} onAnalyze={()=>onAnalyze(review.id)} onOpen={onOpen}/>:null;
}

export function RankedAnalysis({ matches,pickMatches,selectedMap,preferredBrawler,view,onSelectMap,onOpen }: {
  matches:MatchSeries[]; pickMatches:MatchSeries[]; selectedMap:string; preferredBrawler:string; view:'review'|'draft';
  onSelectMap:(map:string)=>void; onOpen:(id:string)=>void;
}) {
  const maps = useMemo(()=>rankedMaps(matches),[matches]);
  const pickMaps = useMemo(()=>pickMatches===matches ? maps : rankedMaps(pickMatches),[matches,maps,pickMatches]);
  const map = maps.find(row=>row.id===selectedMap) ?? maps[0];
  const pickMap = pickMaps.find(row=>row.id===map?.id) ?? map;
  const title=view==='review'?'Análise das séries':'Picks no mapa';
  if (!map || !pickMap) return <Card title={title} icon={BarChart3}>
    <p className="section-note">Nenhuma série ranqueada concluída com mapa identificado neste recorte.</p>
  </Card>;
  return <Card title={title} icon={BarChart3} className="ranked-analysis"
      sub="Séries ranqueadas concluídas no período e nos filtros selecionados."
      action={<label>Mapa da análise<select value={map.id} onChange={event=>onSelectMap(event.target.value)}>
        {maps.map(row=><option key={row.id} value={row.id}>{row.name} · {modeName(row.mode)}</option>)}
      </select></label>}>
      <MapComparison key={JSON.stringify([map.id,preferredBrawler])}
        map={map} pickMap={pickMap} preferredBrawler={preferredBrawler} view={view} onOpen={onOpen}/>
    </Card>;
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
