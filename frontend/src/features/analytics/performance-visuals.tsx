import { useMemo, useState } from 'react';
import { Activity, BarChart3, CalendarDays, Grid2X2, MapPinned, Swords, Target, Trophy } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable, TablePager } from '@/components/data-table';
import { findMap, MapImage, Portrait } from '@/components/game';
import { localDay, modeName, normalize, number, percent, stats } from '@/lib/data';
import type { MatchSeries } from '@/lib/match-series';
import { picksOnMap, rankedMaps } from '@/lib/ranked-analysis';
import { EvidenceTable } from './ranked-analysis';
import { PerformanceKpis } from './performance-kpis';

export function SummaryKpis({matches}: {matches:MatchSeries[]}) {
  const result=stats(matches);
  const maps=rankedMaps(matches).length;
  const balance=result.wins-result.losses;
  return <PerformanceKpis label="Indicadores do recorte" items={[
    {label:'Win rate',value:percent(result.rate),detail:`${number(result.wins)} V · ${number(result.losses)} D`,icon:Trophy},
    {label:'Séries concluídas',value:number(result.games),icon:Swords},
    {label:'Saldo de séries',value:balance>0?`+${number(balance)}`:number(balance),detail:'Vitórias menos derrotas',icon:Activity,
      tone:balance>0?'win':balance<0?'loss':undefined},
    {label:'Mapas jogados',value:number(maps),icon:MapPinned},
  ]}/>;
}

export function ModeWinRateChart({matches}: {matches:MatchSeries[]}) {
  const modes=useMemo(()=>{
    const groups=new Map<string,{label:string;matches:MatchSeries[]}>();
    for(const match of matches){
      const mode=match.latest.mode;
      if(!mode)continue;
      const key=normalize(mode), group=groups.get(key)??{label:modeName(mode),matches:[]};
      group.matches.push(match);
      groups.set(key,group);
    }
    return [...groups].map(([key,group])=>({key,label:group.label,...stats(group.matches)}))
      .sort((a,b)=>b.games-a.games||a.label.localeCompare(b.label,'pt-BR'));
  },[matches]);
  return <Card title="Win rate por modo" icon={Target} className="ranked-analysis"
    sub={modes.length>6?'Seis modos com mais séries no recorte.':'Aproveitamento nas séries concluídas.'}>
    {modes.length?<div className="analysis-bars">{modes.slice(0,6).map(mode=><div key={mode.key} className="analysis-bar-row">
      <div><strong>{mode.label}</strong><span>{percent(mode.rate)} · {number(mode.games)} {mode.games===1?'série':'séries'}</span></div>
      <span className="analysis-track" aria-hidden="true"><i style={{width:`${(mode.rate??0)*100}%`}}/></span>
    </div>)}</div>:<p className="section-note">Nenhuma série com modo identificado neste recorte.</p>}
  </Card>;
}

const weekMs=7*24*60*60*1000;

function weekOf(day:string) {
  const date=new Date(`${day}T00:00:00.000Z`);
  return date.getTime()-((date.getUTCDay()+6)%7)*(weekMs/7);
}

function recentWeeks(matches:MatchSeries[]) {
  const entries=matches.map(match=>({match,week:weekOf(localDay(match.latest.played_at))}));
  if(!entries.length)return [];
  const first=entries.reduce((week,row)=>Math.min(week,row.week),Infinity);
  const last=entries.reduce((week,row)=>Math.max(week,row.week),-Infinity);
  const count=Math.min(6,(last-first)/weekMs+1);
  return Array.from({length:count},(_,index)=>{
    const offset=index-count+1;
    const week=last+offset*weekMs;
    const entriesInWeek=entries.filter(row=>row.week===week).map(row=>row.match);
    const start=new Date(week).toISOString().slice(0,10);
    return {start,label:`${start.slice(8)}/${start.slice(5,7)}`,matches:entriesInWeek,...stats(entriesInWeek)};
  });
}

export function EvolutionTrends({ matches,onOpen }: { matches:MatchSeries[]; onOpen:(id:string)=>void }) {
  const weeks=useMemo(()=>recentWeeks(matches),[matches]);
  const [selected,setSelected]=useState('');
  const week=weeks.find(row=>row.start===selected);
  const played=weeks.filter(row=>row.games>0).length;
  const recent=stats(weeks.flatMap(row=>row.matches));
  const maximum=Math.max(1,...weeks.map(row=>row.games));
  const graphs=[{title:'Win rate semanal',value:(row:typeof weeks[number])=>percent(row.rate),fill:(row:typeof weeks[number])=>row.rate??0},
    {title:'Volume semanal',value:(row:typeof weeks[number])=>number(row.games),fill:(row:typeof weeks[number])=>row.games/maximum}];
  return <>
    <PerformanceKpis label="Indicadores das semanas exibidas" items={[
      {label:'Win rate recente',value:percent(recent.rate),detail:'Até seis semanas do recorte',icon:Trophy},
      {label:'Séries nas semanas exibidas',value:number(recent.games),icon:Swords},
      {label:'Semanas com séries',value:number(played),detail:`${number(weeks.length)} no gráfico`,icon:CalendarDays},
    ]}/>
    <div className="performance-two-columns">{graphs.map(({title,value,fill})=><Card title={title} key={title} icon={BarChart3} className="ranked-analysis"
      sub="Semanas a partir de segunda-feira · horário de Brasília.">
      {weeks.length?<div className="analysis-week-chart">{weeks.map(row=><button type="button" key={row.start}
        disabled={!row.games} aria-pressed={row.start===selected} aria-label={`${title} · semana de ${row.label} · ${value(row)} · ${number(row.games)} séries`}
        onClick={()=>setSelected(current=>current===row.start?'':row.start)}>
        <strong>{value(row)}</strong><span className="analysis-week-bar" aria-hidden="true"><i style={{height:`${fill(row)*100}%`}}/></span>
        <small>{row.label}</small>
      </button>)}</div>:<p className="section-note">Nenhuma série concluída neste recorte.</p>}
    </Card>)}</div>
    {week&&week.games>0&&<EvidenceTable evidence={{id:week.start,title:`Séries da semana de ${week.label}`,rows:week.matches.map(match=>({match}))}} onOpen={onOpen}/>}
  </>;
}

export function MapResultsChart({matches,onReview}: {matches:MatchSeries[];onReview:(map:string)=>void}) {
  const maps=useMemo(()=>rankedMaps(matches).slice(0,6).map(map=>({...map,...stats(map.matches)})),[matches]);
  const maximum=maps[0]?.games??1;
  return <Card title="Vitórias e derrotas por mapa" icon={BarChart3} className="ranked-analysis"
    sub={maps.length===6?'Seis mapas com mais séries no recorte.':'Séries concluídas no recorte.'}>
    {maps.length?<div className="map-results-chart"><div className="map-chart-legend" aria-hidden="true">
      <span data-result="victory">Vitórias</span><span data-result="defeat">Derrotas</span></div>
      {maps.map(map=><button className="map-chart-row" key={map.id} onClick={()=>onReview(map.id)}
        aria-label={`Revisar ${map.name} · ${number(map.wins)} ${map.wins===1?'vitória':'vitórias'} · ${number(map.losses)} ${map.losses===1?'derrota':'derrotas'}`}>
        <span className="map-chart-name"><MapImage map={findMap(map.name,null,map.mode)}/><span><strong>{map.name}</strong><small>{modeName(map.mode)}</small></span></span>
        <span className="analysis-track" aria-hidden="true">
          <i data-result="victory" style={{width:`${map.wins/maximum*100}%`}}/>
          <i data-result="defeat" style={{width:`${map.losses/maximum*100}%`}}/>
        </span>
        <span className="map-chart-count">{number(map.wins)} V · {number(map.losses)} D</span>
      </button>)}
    </div>:<p className="section-note">Nenhuma série concluída com mapa identificado neste recorte.</p>}
  </Card>;
}

const brawlersPerPage=6;

export function DraftCoverage({ matches,onOpen }: { matches:MatchSeries[]; onOpen:(id:string)=>void }) {
  const [columnPage,setColumnPage]=useState(1);
  const [selection,setSelection]=useState<{map:string; pick:string}|null>(null);
  const maps=useMemo(()=>rankedMaps(matches).map(map=>{
    const picks=picksOnMap(map.matches).rows;
    return {...map,picks:new Map(picks.map(pick=>[pick.id,pick])),covered:picks.filter(pick=>pick.games>=3).length};
  }),[matches]);
  const allBrawlers=useMemo(()=>picksOnMap(maps.flatMap(map=>map.matches)).rows,[maps]);
  const pages=Math.max(1,Math.ceil(allBrawlers.length/brawlersPerPage));
  const page=Math.min(columnPage,pages);
  const columns=allBrawlers.slice((page-1)*brawlersPerPage,page*brawlersPerPage);
  const map=maps.find(row=>row.id===selection?.map);
  const pick=selection&&map?.picks.get(selection.pick);
  const known=allBrawlers.reduce((total,brawler)=>total+brawler.games,0);
  return <Card title="Cobertura de picks por mapa" icon={Grid2X2} className="ranked-analysis"
    sub="Cada célula mostra o win rate e o número de séries do brawler naquele mapa.">
    {columns.length?<>
      <div className="performance-card-kpis"><PerformanceKpis label="Indicadores da matriz" items={[
        {label:'Picks distintos',value:number(allBrawlers.length)},
        {label:'Mapas com alternativas',value:`${number(maps.filter(row=>row.covered>=2).length)} / ${number(maps.length)}`,
          detail:'Pelo menos dois picks com 3+ séries'},
        {label:'Cobertura da matriz',value:percent(known/matches.length),detail:`${number(known)} de ${number(matches.length)} séries com mapa e pick`},
      ]}/></div>
      <p className="section-note">Abra uma célula para ver as partidas. A cobertura conta brawlers com três ou mais séries no mapa.</p>
      <PagedTable label="Matriz de cobertura de picks" className="pick-matrix" rows={maps} pageSize={7} unit={['mapa','mapas']}
        headings={<><th scope="col">Mapa / cobertura</th>{columns.map(brawler=><th scope="col" key={brawler.id}>
          <span className="image-label"><Portrait name={brawler.name}/>{brawler.name}</span></th>)}</>}
        renderRow={row=><tr key={row.id}><th scope="row"><strong>{row.name}</strong><small>{number(row.covered)} {row.covered===1?'opção':'opções'} com ≥3 séries</small></th>
          {columns.map(brawler=>{
            const cell=row.picks.get(brawler.id);
            return <td key={brawler.id}>{cell?<button type="button" className="pick-matrix-cell"
              data-result={cell.games<3?'small':cell.wins>cell.losses?'victory':cell.losses>cell.wins?'defeat':'balanced'}
              aria-pressed={map?.id===row.id&&pick?.id===cell.id}
              aria-label={`${row.name} · ${brawler.name} · ${percent(cell.rate)} de vitórias · ${number(cell.games)} ${cell.games===1?'série':'séries'}`}
              onClick={()=>setSelection(current=>current?.map===row.id&&current.pick===cell.id?null:{map:row.id,pick:cell.id})}>
              <strong>{percent(cell.rate)}</strong><small>{number(cell.games)} {cell.games===1?'série':'séries'}</small></button>:<span aria-label="Sem séries neste mapa">—</span>}</td>;
          })}</tr>}/>
      {pages>1&&<TablePager label="Brawlers da matriz" summary={`${number(allBrawlers.length)} brawlers`} page={page} pages={pages}
        canGoBack={page>1} canGoNext={page<pages} onPrevious={()=>setColumnPage(page-1)} onNext={()=>setColumnPage(page+1)}/>}
      {map&&pick&&<EvidenceTable evidence={{id:JSON.stringify([map.id,pick.id]),title:`${pick.name} · ${map.name}`,rows:pick.matches.map(match=>({match}))}} onOpen={onOpen}/>}
    </>:<p className="section-note">Aguardando séries concluídas com mapa e brawler identificados.</p>}
  </Card>;
}
