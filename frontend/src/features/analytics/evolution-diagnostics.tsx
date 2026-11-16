import { useContext, useMemo, useState } from 'react';
import { ArrowLeftRight, History } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { Portrait } from '@/components/game';
import { dateTime, modeName, normalize, number, percent } from '@/lib/data';
import { diagnoseMapMix, patchComparison, sessionStartsAndEnds } from '@/lib/evolution-analysis';
import { LiveMeta } from '@/lib/live';
import type { MatchSeries } from '@/lib/match-series';
import { publicPicks, usePublicStats } from '@/lib/scouting';
import { playerPick } from '@/lib/season-comparison';
import { EvidenceTable } from './ranked-analysis';
import { PerformanceKpis } from './performance-kpis';

type Samples = {id:string; name:string; current:MatchSeries[]; previous:MatchSeries[]};
const periods = [{id:'current',label:'Em análise'},{id:'previous',label:'Anterior'}] as const;
const pp = (value:number|null) => {
  if(value===null)return '—';
  const rounded=Math.round(value*1000)/10;
  return `${rounded>0?'+':''}${number(rounded)} p.p.`;
};
const sample = (row:{rate:number|null; wins:number; losses:number})=>
  <><strong>{percent(row.rate)}</strong><small>{number(row.wins)} V · {number(row.losses)} D</small></>;
const iso=(value:number)=>new Date(value).toISOString();
const sequence=(matches:MatchSeries[])=>matches.slice(0,8).map(match=>match.result==='victory'?'V':'D').join(' · ')+(matches.length>8?` · +${matches.length-8}`:'');

function PeriodSeries({ row,onOpen }: {row:Samples; onOpen:(id:string)=>void}) {
  const [period,setPeriod] = useState<'current'|'previous'>(row.current.length?'current':'previous');
  return <section aria-label={`${row.name} · Séries dos períodos`}>
    <div className="mode-filters">
      <label>Amostra de {row.name}<select value={period} onChange={event=>setPeriod(event.target.value==='previous'?'previous':'current')}>
        {periods.map(({id,label})=><option key={id} value={id}>{label} · {number(row[id].length)} séries</option>)}
      </select></label>
    </div>
    <EvidenceTable evidence={{id:`${row.id}:${period}`,title:`${row.name} · ${period==='current'?'Em análise':'Anterior'}`,
      rows:row[period].map(match=>({match}))}} onOpen={onOpen}/>
  </section>;
}

export function MapMixDiagnosis({ current,previous,onOpen }: {current:MatchSeries[];previous:MatchSeries[];onOpen:(id:string)=>void}) {
  const [selected,setSelected]=useState<string|null>(null);
  const result=diagnoseMapMix(current,previous);
  if (!result) return <section className="analysis-section"><h3>O que mudou no win rate?</h3>
    <p className="muted">Aguardando séries decisivas nas duas temporadas para decompor a diferença.</p></section>;
  const row=result.rows.find(entry=>entry.id===selected);
  return <section className="analysis-section" aria-label="Diagnóstico da mudança de win rate">
    <h3>O que mudou no win rate?</h3>
    <PerformanceKpis label="Contribuições para a diferença de win rate" items={[
      {label:'Mudança total',value:pp(result.total)},
      {label:'Resultado nos mesmos mapas',value:pp(result.within)},
      {label:'Mudança na frequência dos mapas',value:pp(result.mix)},
      {label:'Mapas sem comparação',value:pp(result.unmatched)},
    ]}/>
    <p className="muted">As duas contribuições dos mapas em comum usam a média de peso e de aproveitamento entre períodos. Mapas presentes em só um período e séries sem mapa entram na última parcela.</p>
    <PagedTable label="Contribuições por mapa" rows={result.rows} pageSize={5} unit={['mapa','mapas']}
      headings={<><th>Mapa</th><th>Em análise</th><th>Anterior</th><th>Resultado</th><th>Frequência</th><th>Sem comparação</th></>}
      renderRow={entry=><tr key={entry.id}>
        <th scope="row"><button className="text-button" aria-pressed={row?.id===entry.id}
          onClick={()=>setSelected(row?.id===entry.id?null:entry.id)}>{entry.name??'Mapa desconhecido'}</button>
          {entry.mode&&<small>{modeName(entry.mode)}</small>}</th>
        <td>{sample(entry.now)}<small>{percent(entry.currentShare)} das séries</small></td>
        <td>{sample(entry.before)}<small>{percent(entry.previousShare)} das séries</small></td>
        <td>{pp(entry.within)}</td><td>{pp(entry.mix)}</td><td>{pp(entry.unmatched)}</td>
      </tr>}/>
    {row&&<PeriodSeries key={row.id} row={{...row,name:row.name??'Mapa desconhecido'}} onOpen={onOpen}/>}
  </section>;
}

function PatchMeta({map,mode,brawler}: {map:string;mode:string|null;brawler:string}) {
  const current=usePublicStats(mode,map,undefined,'patch');
  const previous=usePublicStats(mode,map,undefined,'previous_patch');
  const summary=(view:typeof current)=>{
    if(!view.sample)return '—';
    const row=publicPicks(view.sample).find(row=>normalize(row.name)===normalize(brawler));
    return row&&row.games?`${percent(row.wins/row.games)} · ${number(row.games)} registros decisivos`:'—';
  };
  return <p className="section-note">Referência da Meta · {brawler} · Antes {summary(previous)} · Depois {summary(current)} · Supercell, Elo de perfil e registros que podem ser rodadas.</p>;
}

export function PatchEvolution({matches,exportedAt,onOpen}: {matches:MatchSeries[];exportedAt:string;onOpen:(id:string)=>void}) {
  const {report}=useContext(LiveMeta);
  const [selected,setSelected]=useState<string|null>(null);
  const current=report?.windows.patch, previous=report?.windows.previous_patch;
  const result=useMemo(()=>patchComparison(matches,current,previous,Date.parse(exportedAt)),[matches,current,previous,exportedAt]);
  const common=result?.rows.filter(row=>row.now.decided&&row.before.decided)??[];
  const unmatched=result?.rows.filter(row=>!row.now.decided||!row.before.decided)??[];
  const row=result?.rows.find(entry=>entry.id===selected);
  const patchTable=(rows:typeof common,label:string)=><PagedTable label={label} rows={rows} pageSize={5} unit={['combinação','combinações']}
    headings={<><th>Mapa e pick</th><th>Antes</th><th>Depois</th><th>Δ win rate</th></>}
    renderRow={entry=><tr key={entry.id}>
      <th scope="row"><button className="text-button image-label" aria-pressed={row?.id===entry.id} onClick={()=>setSelected(row?.id===entry.id?null:entry.id)}>
        <Portrait name={entry.brawler}/>{entry.brawler}</button><small>{entry.name} · {modeName(entry.mode)}</small></th>
      <td>{sample(entry.before)}</td><td>{sample(entry.now)}</td>
      <td>{pp(entry.now.rate===null||entry.before.rate===null?null:entry.now.rate-entry.before.rate)}</td>
    </tr>}/>;
  return <Card title="Antes × depois do balanceamento" icon={ArrowLeftRight} className="ranked-analysis"
    sub="Janelas de mesma duração dos dois lados do corte. Mesmo mapa, modo e pick.">
    {result?<div className="analysis-section">
      <p className="muted">{current?.label}{current?.date_only?' · O horário do patch é estimado.':''}</p>
      <p className="muted">Antes {dateTime(iso(result.window.previous.start))} a {dateTime(iso(result.window.previous.end))}
        {' · Depois '}{dateTime(iso(result.window.current.start))} a {dateTime(iso(result.window.current.end))}</p>
      <p className="muted">{number(common.length)} combinações nas duas janelas · {number(unmatched.length)} em só uma janela
        {result.unknown.current+result.unknown.previous>0&&` · ${number(result.unknown.current+result.unknown.previous)} séries sem mapa, modo ou pick identificado`}</p>
      {common.length?patchTable(common,'Mapa e pick nos dois patches'):<p className="muted">Aguardando resultados com o mesmo mapa, modo e pick nos dois lados.</p>}
      {unmatched.length>0&&<details><summary>Combinações em só uma janela</summary>{patchTable(unmatched,'Mapa e pick em um patch')}</details>}
      {row&&<><PeriodSeries key={row.id} row={{...row,name:`${row.name} · ${row.brawler}`}} onOpen={onOpen}/>
        {result.metaComparable&&row.name&&row.now.decided>0&&row.before.decided>0&&<PatchMeta map={row.name} mode={row.mode} brawler={row.brawler}/>}</>}
    </div>:<p className="section-note">Aguardando o calendário de dois patches e histórico em uma janela válida.</p>}
  </Card>;
}

export function SessionEvolution({history,matches,onOpen}: {history:MatchSeries[];matches:MatchSeries[];onOpen:(id:string)=>void}) {
  const [selected,setSelected]=useState<string|null>(null);
  const result=useMemo(()=>sessionStartsAndEnds(history,new Set(matches.map(match=>match.id))),[history,matches]);
  const row=result.rows.find(entry=>entry.first.id===selected);
  return <Card title="Início × fim da sessão" icon={History} className="ranked-analysis"
    sub="Primeira e última metade das sessões reconstruídas como em Progressão. O jogo do meio fica fora quando o total é ímpar.">
    {result.rows.length?<div className="analysis-section">
      <PerformanceKpis label="Win rate por metade da sessão" items={[
        {label:'Sessões comparáveis',value:number(result.rows.length)},
        {label:'Início',value:percent(result.start.rate),detail:`${number(result.start.decided)} séries decisivas`},
        {label:'Fim',value:percent(result.end.rate),detail:`${number(result.end.decided)} séries decisivas`},
      ]}/>
      <p className="muted">Os filtros mantêm só as sessões com séries nos dois lados. A duração abaixo é o intervalo entre o horário da primeira e da última rodada registradas.</p>
      <PagedTable label="Início e fim por sessão" rows={result.rows} pageSize={5} unit={['sessão','sessões']}
        headings={<><th>Sessão</th><th>Início</th><th>Fim</th></>}
        renderRow={entry=><tr key={entry.first.id}>
          <th scope="row"><button className="text-button" onClick={()=>setSelected(row?.first.id===entry.first.id?null:entry.first.id)}
            aria-pressed={row?.first.id===entry.first.id}>{dateTime(entry.first.played_at)}</button>
            <small>{number(Math.round((Date.parse(entry.last.played_at)-Date.parse(entry.first.played_at))/60000))} min</small></th>
          <td>{sample(entry.firstHalf)}<small>{sequence(entry.start)}</small></td>
          <td>{sample(entry.lastHalf)}<small>{sequence(entry.end)}</small></td>
        </tr>}/>
      {row&&<EvidenceTable evidence={{id:row.first.id,title:`Séries da sessão de ${dateTime(row.first.played_at)} · início e fim`,
        rows:[...row.start,...row.end].map(match=>({match}))}} onOpen={onOpen}/>}
    </div>:<p className="section-note">Aguardando sessões com séries concluídas nas duas metades dentro dos filtros.</p>}
  </Card>;
}

export function patchHistoryScope(matches:MatchSeries[], allowed:ReadonlySet<string>, brawler:string) {
  return matches.filter(match=>allowed.has(match.id)&&(!brawler||normalize(playerPick(match))===normalize(brawler)));
}
