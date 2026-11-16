import { useMemo, useState } from 'react';
import { Crosshair, Flag, Swords } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { Portrait } from '@/components/game';
import { dateTime, modeName, number, percent, resultName } from '@/lib/data';
import type { MatchSeries } from '@/lib/match-series';
import { heistObjectivePoints, openingConversion, opponentCompositions } from '@/lib/ranked-analysis';
import { EvidenceTable } from './ranked-analysis';

type ReviewProps = { matches:MatchSeries[]; onOpen:(id:string)=>void };
type Opening = 'victory'|'defeat';
const openingColumns = [
  {key:'victory',label:'Após vencer a 1ª',stat:'afterWin'},
  {key:'defeat',label:'Após perder a 1ª',stat:'afterLoss'},
] as const;
const decimal = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
const axisValue = new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1});

function OpeningReview({matches,onOpen}:ReviewProps) {
  const [groupBy,setGroupBy] = useState<'map'|'brawler'>('map');
  const [selected,setSelected] = useState<{id:string; opening:Opening}|null>(null);
  const rows = useMemo(()=>openingConversion(matches,groupBy),[matches,groupBy]);
  const group = rows.find(row=>row.id===selected?.id);
  const evidence = group && selected ? {
    id:JSON.stringify(selected),
    title:`${group.name} · ${selected.opening==='victory'?'após vencer':'após perder'} a primeira rodada`,
    rows:group[selected.opening].map(match=>({match})),
  } : null;
  return <Card title="Conversão da primeira rodada" icon={Flag} className="ranked-analysis"
    sub="Vitórias na série após ganhar ou perder a abertura. Aberturas empatadas ficam fora das duas amostras."
    action={<label>Agrupar por<select value={groupBy} onChange={event=>{
      setGroupBy(event.target.value==='brawler'?'brawler':'map');setSelected(null);
    }}><option value="map">Mapa</option><option value="brawler">Brawler</option></select></label>}>
    <div className="analysis-section">
      {rows.length ? <PagedTable label="Conversão da primeira rodada" rows={rows} pageKey={groupBy} pageSize={6} unit={['grupo','grupos']}
        headings={<><th>{groupBy==='map'?'Mapa':'Brawler'}</th><th aria-sort="descending">Séries</th>{openingColumns.map(column=><th key={column.key}>{column.label}</th>)}</>}
        renderRow={row=><tr key={row.id}><th scope="row">{groupBy==='brawler'?<span className="image-label"><Portrait name={row.name}/>{row.name}</span>
          :<>{row.name}<small>{modeName(row.mode)}</small></>}</th><td>{number(row.games)}</td>
          {openingColumns.map(({key,label,stat})=>{
            const sample=row[stat];
            const isSelected=selected?.id===row.id && selected.opening===key;
            return <td key={key}>{sample.rate===null?'—':<button type="button" className="text-button" aria-pressed={isSelected}
              aria-label={`${row.name} · ${label} · ${percent(sample.rate)} · ${number(sample.wins)} vitórias em ${number(sample.games)} séries`}
              onClick={()=>setSelected(isSelected?null:{id:row.id,opening:key})}>
              <b>{percent(sample.rate)}</b> · {number(sample.wins)}/{number(sample.games)}
            </button>}</td>;
          })}
        </tr>}/>
      :<p className="muted">Aguardando séries completas com resultado da primeira rodada e {groupBy==='map'?'mapa':'brawler'} identificado.</p>}
    </div>
    {evidence&&<EvidenceTable evidence={evidence} onOpen={onOpen}/>}
  </Card>;
}

function HeistReview({matches,onOpen}:ReviewProps) {
  const {points,eligible} = useMemo(()=>heistObjectivePoints(matches),[matches]);
  const bounds = points.reduce((max,point)=>({damage:Math.max(max.damage,point.damage),objective:Math.max(max.objective,point.objective)}),
    {damage:1,objective:1});
  return <Card title="Cofre × combate no Roubo" icon={Crosshair} className="ranked-analysis"
    sub="Dano causado e dano ao cofre por minuto. Cada ponto abre uma série.">
    <div className="analysis-section">
      <p className="muted">{number(points.length)} de {number(eligible)} séries de Roubo com duração e os dois valores completos.</p>
      {points.length?<>
        <div className="heist-scatter-label"><span>Dano ao cofre/min</span><span>{axisValue.format(bounds.objective)}</span></div>
        <div className="heist-scatter" role="group" aria-label="Séries por dano causado e dano ao cofre por minuto">
          {points.map(({match,damage,objective})=>{
            const label=`${resultName(match.result)} · ${dateTime(match.latest.played_at)} · Dano ${decimal.format(damage)}/min · Cofre ${decimal.format(objective)}/min`;
            return <button key={match.id} type="button" title={label} aria-label={label} data-result={match.result}
              style={{left:`${damage/bounds.damage*100}%`,bottom:`${objective/bounds.objective*100}%`}} onClick={()=>onOpen(match.latest.id)}/>;
          })}
        </div>
        <div className="heist-scatter-label"><span>0</span><span>Dano causado/min</span><span>{axisValue.format(bounds.damage)}</span></div>
        <div className="heist-scatter-legend" aria-label="Legenda"><span data-result="victory">Vitória</span><span data-result="defeat">Derrota</span></div>
        <details>
          <summary>Ver dados do gráfico</summary>
          <PagedTable label="Séries de Roubo" rows={points} pageSize={5} unit={['série','séries']}
            headings={<><th>Série</th><th>Dano/min</th><th>Cofre/min</th><th>Abrir</th></>}
            renderRow={({match,damage,objective})=><tr key={match.id}>
              <td>{dateTime(match.latest.played_at)}<small>{resultName(match.result)}</small></td>
              <td>{decimal.format(damage)}</td><td>{decimal.format(objective)}</td>
              <td><button className="text-button" onClick={()=>onOpen(match.latest.id)}>Ver partida</button></td>
            </tr>}/>
        </details>
      </>:<p className="muted">Aguardando séries de Roubo com a duração e as estatísticas de dano de todas as rodadas.</p>}
    </div>
  </Card>;
}

function DefeatCompositions({matches,onOpen}:ReviewProps) {
  const [size,setSize] = useState<1|2|3>(1);
  const [selected,setSelected] = useState('');
  const {rows,covered,coveredLosses,losses} = useMemo(()=>opponentCompositions(matches,size),[matches,size]);
  const row = rows.find(group=>group.id===selected);
  return <Card title="Composições nas derrotas" icon={Swords} className="ranked-analysis"
    sub="Mais séries enfrentadas primeiro. Em caso de empate, mais derrotas."
    action={<label>Adversários<select value={size} onChange={event=>{
      setSize(event.target.value==='3'?3:event.target.value==='2'?2:1);setSelected('');
    }}><option value={1}>Individuais</option><option value={2}>Duplas</option><option value={3}>Trios</option></select></label>}>
    <div className="analysis-section">
      <p className="muted">Composição identificada em {number(covered)} de {number(matches.length)} séries e em {number(coveredLosses)} de {number(losses)} derrotas.</p>
      {rows.length ? <PagedTable label="Composições nas derrotas" rows={rows} pageKey={String(size)} pageSize={6} unit={['composição','composições']}
        headings={<><th>Composição adversária</th><th aria-sort="descending">Séries</th><th>Derrotas</th><th>Presença nas derrotas conhecidas</th></>}
        renderRow={group=><tr key={group.id}>
          <th scope="row"><button className="text-button" aria-pressed={selected===group.id}
            onClick={()=>setSelected(selected===group.id?'':group.id)}>
            <span className="image-label">{group.names.map((name,index)=><Portrait key={index} name={name}/>)}{group.names.join(' · ')}</span>
          </button></th>
          <td>{number(group.games)}</td><td>{number(group.losses)}</td><td>{percent(coveredLosses?group.losses/coveredLosses:null)}</td>
        </tr>}/>
      :<p className="muted">Aguardando derrotas com os três adversários identificados no recorte.</p>}
    </div>
    {row&&<EvidenceTable evidence={{id:row.id,title:`Derrotas · ${row.names.join(' + ')}`,rows:row.defeats.map(match=>({match}))}} onOpen={onOpen}/>}
  </Card>;
}

export function ReviewPatterns({matches,onOpen}:ReviewProps) {
  return <>
    <div className="performance-two-columns">
      <OpeningReview matches={matches} onOpen={onOpen}/>
      <HeistReview matches={matches} onOpen={onOpen}/>
    </div>
    <DefeatCompositions matches={matches} onOpen={onOpen}/>
  </>;
}
