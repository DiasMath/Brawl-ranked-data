import { useMemo, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { Portrait } from '@/components/game';
import { brawlerPerformance } from '@/lib/coaching';
import { battleSeason, modeName, normalize, number, percent } from '@/lib/data';
import { mapKey } from '@/lib/external-comparison';
import type { MatchSeries } from '@/lib/match-series';
import { ordered } from '@/lib/scouting';

const options=(values:(string|null|undefined)[], key:(value:string)=>string=normalize)=>[...new Map(values.flatMap(value=>value?[[key(value),value] as const]:[]))]
  .sort((a,b)=>a[1].localeCompare(b[1],'pt-BR',{numeric:true}));

const seriesSeason=(match:MatchSeries)=>match.rounds.map(battleSeason).findLast(value=>value!==null);
const ownMode=(match:MatchSeries)=>normalize(match.latest.mode);
const ownMap=(match:MatchSeries)=>mapKey(match.latest.map_name);

export function BrawlerEvolution({ matches, initialSeason, initialBrawler, mapFilter }: {
  matches:MatchSeries[]; initialSeason:string; initialBrawler:string; mapFilter:string;
}) {
  const [season,setSeason]=useState(normalize(initialSeason));
  const [mode,setMode]=useState('');
  const [map,setMap]=useState('');
  const [brawler,setBrawler]=useState(normalize(initialBrawler));
  const [sort,setSort]=useState<'pick'|'win'>('pick');
  const seasons=useMemo(()=>options(matches.map(seriesSeason)),[matches]);
  const seasonRows=useMemo(()=>season?matches.filter(match=>normalize(seriesSeason(match))===season):matches,[matches,season]);
  const modes=useMemo(()=>options(seasonRows.map(match=>match.latest.mode)),[seasonRows]);
  const activeMode=modes.some(([key])=>key===mode)?mode:'';
  const modeRows=useMemo(()=>activeMode?seasonRows.filter(match=>ownMode(match)===activeMode):seasonRows,[seasonRows,activeMode]);
  const maps=useMemo(()=>options(modeRows.map(match=>match.latest.map_name),mapKey),[modeRows]);
  const activeMap=maps.some(([key])=>key===map)?map:'';
  const result=useMemo(()=>brawlerPerformance(activeMap?modeRows.filter(match=>ownMap(match)===activeMap):modeRows),[modeRows,activeMap]);
  const rows=sort==='pick'?result.rows.slice().sort((a,b)=>b.pickRate-a.pickRate||a.label.localeCompare(b.label,'pt-BR')):
    ordered(result.rows.map(row=>({...row,wins:row.summary.wins,games:row.summary.decided})));
  const selected=rows.find(row=>row.key===brawler)??rows[0];
  const delta=selected&&selected.recent.rate!==null&&selected.previous.rate!==null?
    Math.round((selected.recent.rate-selected.previous.rate)*1000)/10:null;
  return <Card title="Evolução por brawler" icon={Crosshair}
    sub="Taxas da sua conta no histórico coletado ou na temporada escolhida aqui">
    <div className="mode-filters">
      <label>Temporada da ficha<select value={season} onChange={event=>{setSeason(event.target.value);setMode('');setMap('');}}>
        <option value="">Todo o histórico</option>
        {season&&!seasons.some(([key])=>key===season)&&<option value={season}>{initialSeason||season}</option>}
        {seasons.map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Modo da ficha<select value={activeMode} onChange={event=>{setMode(event.target.value);setMap('');}}>
        <option value="">Todos os modos</option>
        {modes.map(([key,label])=><option key={key} value={key}>{modeName(label)}</option>)}
      </select></label>
      <label>Mapa da ficha do brawler<select value={activeMap} disabled={!!mapFilter} onChange={event=>setMap(event.target.value)}>
        <option value="">{mapFilter||'Todos os mapas'}</option>
        {!mapFilter&&maps.map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Ordenar brawlers<select value={sort} onChange={event=>setSort(event.target.value==='win'?'win':'pick')}>
        <option value="pick">Mais escolhidos</option><option value="win">Win rate e amostra</option>
      </select></label>
    </div>
    <p className="section-note">
      Pick rate pessoal = suas partidas com o brawler ÷ partidas com pick identificado.
      {' '}Win rate = vitórias ÷ (vitórias + derrotas). A ficha usa a temporada escolhida acima.
      {result.total>result.known&&` Picks identificados em ${number(result.known)} de ${number(result.total)} partidas.`}
    </p>
    {selected?<><PagedTable label="Taxas por brawler" rows={rows} pageKey={JSON.stringify([season,activeMode,activeMap,sort])}
      headings={<><th>Brawler</th><th>Win rate</th><th>Pick rate pessoal</th></>}
      renderRow={row=><tr key={row.key}>
        <td><button type="button" className="text-button image-label" aria-pressed={selected.key===row.key} onClick={()=>setBrawler(row.key)}>
          <Portrait name={row.label}/>{row.label}
        </button></td>
        <td><strong>{percent(row.summary.rate)}</strong><small>{number(row.summary.wins)} V · {number(row.summary.losses)} D</small></td>
        <td><strong>{percent(row.pickRate)}</strong><small>{number(row.summary.games)} de {number(result.known)} partidas</small></td>
      </tr>}/>
      <div className="series-performance brawler-form">
        <label>Comparar forma do brawler<select value={selected.key} onChange={event=>setBrawler(event.target.value)}>
          {rows.map(row=><option key={row.key} value={row.key}>{row.label}</option>)}
        </select></label>
        <div className="series-performance-grid">
          {([['Últimas 10 decisivas',selected.recent],['Até 10 decisivas anteriores',selected.previous]] as const)
            .map(([label,{rate,decided}])=><div key={label}><small>{label}</small><strong>{percent(rate)}</strong>
              <small>{number(decided)} {decided===1?'partida':'partidas'}</small></div>)}
          <div><small>Variação recente</small><strong>{delta===null?'—':`${delta>0?'+':''}${number(delta)} p.p.`}</strong>
            <small>{delta===null?'Aguardando partidas nas duas janelas':'Diferença entre os win rates acima'}</small></div>
        </div>
        {delta!==null&&<p className="muted">Compare o mesmo mapa e modo antes de usar essa variação para mudar seus picks.</p>}
      </div>
    </>:<p className="section-note">Nenhuma partida com brawler identificado neste recorte.</p>}
  </Card>;
}
