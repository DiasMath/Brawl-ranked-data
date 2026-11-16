import { useContext, useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { PagedTable } from '@/components/data-table';
import { Portrait } from '@/components/game';
import { normalize, number, orderByMatchCount, percent } from '@/lib/data';
import { observedBans } from '@/lib/external-comparison';
import { inMetaPeriod, LiveMeta, metaPeriods } from '@/lib/live';
import type { LivePeriod } from '@/lib/live';
import { seriesBattle } from '@/lib/match-series';
import type { MatchSeries } from '@/lib/match-series';
import { personalMapPicks } from '@/lib/ranked-analysis';
import { publicBans, usePublicStats } from '@/lib/scouting';

type MapProps = {matches:MatchSeries[]; map:string; mode:string|null};

export function MapPickPlan({ matches,map,mode,onDraft }:MapProps&{onDraft?:()=>void}) {
  const rows=useMemo(()=>personalMapPicks(matches),[matches]);
  const heist=normalize(mode)==='heist';
  return <section className="analysis-section" aria-label="Melhores picks pessoais">
    <div className="analysis-section-head">
      <div><h3>Melhores picks pessoais</h3>
        <p className="muted">Aproveitamento ajustado pela amostra. Mínimo de três séries decisivas em {map}.</p></div>
      {onDraft&&<button type="button" className="button small subtle" onClick={onDraft}><FlaskConical size={14}/> Abrir Draft Lab</button>}
    </div>
    {rows.length?<PagedTable label="Melhores picks pessoais" rows={rows} pageKey={map} pageSize={5} unit={['brawler','brawlers']}
      headings={<><th>Brawler</th><th>Win rate</th><th>Pick rate</th><th>Forma recente</th>{heist&&<th>Cofre/min</th>}</>}
      renderRow={row=>{
        const delta=row.recent.rate!==null&&row.previous.rate!==null?(row.recent.rate-row.previous.rate)*100:null;
        return <tr key={row.id}><th scope="row"><span className="image-label"><Portrait name={row.name}/>{row.name}</span></th>
          <td><strong>{percent(row.rate)}</strong><small>{number(row.wins)} V · {number(row.losses)} D</small></td>
          <td>{percent(row.pickRate)}<small>{number(row.games)} escolhas no mapa</small></td>
          <td>{delta===null?'—':`${delta>0?'+':''}${number(Math.round(delta*10)/10)} p.p.`}
            <small>{percent(row.recent.rate)} × {percent(row.previous.rate)} · {row.recent.decided} × {row.previous.decided} séries</small></td>
          {heist&&<td>{row.objective.average===null?'—':number(Math.round(row.objective.average))}
            <small>{number(row.objective.coverage)} séries com dado completo</small></td>}
        </tr>;
      }}/>:<p className="muted">Aguardando brawlers com três séries decisivas no mapa.</p>}
  </section>;
}

export function BanComparison({matches,map,mode}:MapProps) {
  const {report,period}=useContext(LiveMeta);
  const [selected,setSelected]=useState<LivePeriod|null>(null);
  const periods=metaPeriods(report);
  const active=periods.some(([key])=>key===selected)?selected!:periods.some(([key])=>key===period)?period:periods[0][0];
  const {index,context,sample,loading}=usePublicStats(mode,map,undefined,active);
  const personal=useMemo(()=>index?matches.filter(match=>inMetaPeriod(match.latest.played_at,active,report)):[],[index,matches,active,report]);
  const account=useMemo(()=>observedBans(personal.map(seriesBattle)),[personal]);
  const competitive=sample?publicBans(sample):[];
  const counts=sample?.banKnown ?? 0;
  type BanRow = {name:string; games:number; wins:number; losses:number; personal:number; competitive:number};
  const rows=new Map<string,BanRow>();
  const rowFor=(name:string)=>{
    const id=normalize(name);
    let row=rows.get(id);
    if(!row){row={name,games:0,wins:0,losses:0,personal:0,competitive:0};rows.set(id,row);}
    return row;
  };
  for (const match of personal) {
    const opponents=new Map(match.latest.players.filter(player=>player.side==='opponent'&&player.brawler)
      .map(player=>[normalize(player.brawler),player.brawler!]));
    for (const name of opponents.values()) {
      const row=rowFor(name);
      row.games++;
      row.wins+=Number(match.result==='victory');
      row.losses+=Number(match.result==='defeat');
    }
  }
  for (const row of account.rows) rowFor(row.label).personal=row.bans;
  for (const row of competitive) rowFor(row.name).competitive=row.count;
  const data=orderByMatchCount([...rows.values()].sort((a,b)=>b.competitive-a.competitive||b.personal-a.personal||a.name.localeCompare(b.name,'pt-BR')),'losses');
  return <section className="analysis-section" aria-label="Bans da conta × meta">
    <div className="analysis-section-head">
      <div><h3>Bans da conta × meta</h3>
        <p className="muted">{map}{index&&` · ${index.start} a ${index.end} · ${index.source}`}</p></div>
      <label>Janela da Meta<select value={active} onChange={event=>setSelected(event.target.value as LivePeriod)}>
        {periods.map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    <p className="muted">A conta mantém os filtros de Desempenho dentro da janela comparada. A Meta usa a população da fonte. Bans da conta são os do draft inteiro.</p>
    {index&&<p className="muted">Cobertura da conta {number(account.known)}/{number(account.total)} séries · Cobertura da Meta {number(counts)}/{number(context?.sets??0)} {index.unit??'registros'}.
      {index.unit==='registros'&&' Registros competitivos podem representar rodadas.'}</p>}
    {!!data.length&&<PagedTable label="Bans da conta e da Meta por brawler" rows={data} pageKey={`${map}:${active}`} pageSize={5} unit={['brawler','brawlers']}
      headings={<><th>Brawler</th><th aria-sort="descending">Enfrentou</th><th>Derrotas</th><th>Ban na conta</th><th>Ban na Meta</th></>}
      renderRow={row=><tr key={normalize(row.name)}><th scope="row"><span className="image-label"><Portrait name={row.name}/>{row.name}</span></th>
        <td>{number(row.games)}</td><td>{number(row.losses)}{row.games>0&&<small>{percent(row.losses/row.games)}</small>}</td>
        <td>{percent(account.known?row.personal/account.known:null)}{account.known>0&&<small>{number(row.personal)} de {number(account.known)}</small>}</td>
        <td>{percent(counts?row.competitive/counts:null)}{counts>0&&<small>{number(row.competitive)} de {number(counts)}</small>}</td>
      </tr>}/>}
    {!counts&&<p className="muted">{loading?'Carregando referência competitiva…':'Aguardando listas de bans na referência competitiva para este mapa e janela.'}</p>}
  </section>;
}
