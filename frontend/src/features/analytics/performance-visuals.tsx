import { useMemo, useState } from 'react';
import { BarChart3, Grid2X2 } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable, TablePager } from '@/components/data-table';
import { findMap, MapImage, Portrait } from '@/components/game';
import { modeName, number, percent, stats } from '@/lib/data';
import type { MatchSeries } from '@/lib/match-series';
import { picksOnMap, rankedMaps } from '@/lib/ranked-analysis';
import { EvidenceTable } from './ranked-analysis';

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
  return <Card title="Cobertura de picks por mapa" icon={Grid2X2} className="ranked-analysis"
    sub="Cada célula mostra o win rate e o número de séries do brawler naquele mapa.">
    {columns.length?<>
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
