import { useMemo, useState } from 'react';
import { Crosshair, Flag, FlaskConical } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { ModeIcon, Portrait } from '@/components/game';
import { brawlerMapPerformance, brawlerMatchups, brawlerPerformance } from '@/lib/coaching';
import { modeName, normalize, number, orderByMatchCount, orderByWinRate, percent } from '@/lib/data';
import { mapKey } from '@/lib/external-comparison';
import type { MatchSeries } from '@/lib/match-series';
import { seriesSeason } from '@/lib/match-series';

const options=(values:(string|null|undefined)[], key:(value:string)=>string=normalize)=>[...new Map(values.flatMap(value=>value?[[key(value),value] as const]:[]))]
  .sort((a,b)=>a[1].localeCompare(b[1],'pt-BR',{numeric:true}));

const ownMode=(match:MatchSeries)=>normalize(match.latest.mode);
const ownMap=(match:MatchSeries)=>mapKey(match.latest.map_name);

export function BrawlerEvolution({ matches, initialSeason, initialBrawler, mapFilter, onDraft, onMatch, onTrain }: {
  matches:MatchSeries[]; initialSeason:string; initialBrawler:string; mapFilter:string;
  onDraft:(map:string,season:string)=>void;
  onMatch:(id:string)=>void;
  onTrain:(map:string,brawler:string)=>void;
}) {
  const [season,setSeason]=useState(normalize(initialSeason));
  const [mode,setMode]=useState('');
  const [map,setMap]=useState('');
  const [brawler,setBrawler]=useState(normalize(initialBrawler));
  const [sort,setSort]=useState<'pick'|'win'>('pick');
  const [side,setSide]=useState<'ally'|'opponent'>('opponent');
  const [matchupOrder,setMatchupOrder]=useState({ally:false,opponent:true});
  const hardFirst=matchupOrder[side];
  const seasons=useMemo(()=>options(matches.map(seriesSeason)),[matches]);
  const seasonRows=useMemo(()=>season?matches.filter(match=>normalize(seriesSeason(match))===season):matches,[matches,season]);
  const modes=useMemo(()=>options(seasonRows.map(match=>match.latest.mode)),[seasonRows]);
  const activeMode=modes.some(([key])=>key===mode)?mode:'';
  const modeRows=useMemo(()=>activeMode?seasonRows.filter(match=>ownMode(match)===activeMode):seasonRows,[seasonRows,activeMode]);
  const maps=useMemo(()=>options(modeRows.map(match=>match.latest.map_name),mapKey),[modeRows]);
  const activeMap=maps.some(([key])=>key===map)?map:'';
  const scoped=useMemo(()=>activeMap?modeRows.filter(match=>ownMap(match)===activeMap):modeRows,[modeRows,activeMap]);
  const result=useMemo(()=>brawlerPerformance(scoped),[scoped]);
  const rows=sort==='pick'?result.rows.slice().sort((a,b)=>b.pickRate-a.pickRate||a.label.localeCompare(b.label,'pt-BR')):
    orderByWinRate(result.rows.map(row=>({...row,wins:row.summary.wins,games:row.summary.decided})));
  const selected=rows.find(row=>row.key===brawler)??rows[0];
  const selectedKey=selected?.key;
  const byMap=useMemo(()=>selectedKey?orderByWinRate(brawlerMapPerformance(scoped,selectedKey)):[],[scoped,selectedKey]);
  const matchups=useMemo(()=>selectedKey?brawlerMatchups(scoped,selectedKey,side):null,[scoped,selectedKey,side]);
  const allies=side==='ally';
  const counterpart=allies?'Aliado':'Adversário';
  const relation=allies?'com':'contra';
  const seasonLabel=seasons.find(([key])=>key===season)?.[1]??(season?initialSeason:'');
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
        <option value="pick">Mais escolhidos</option><option value="win">Maior win rate</option>
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
      <div className="card-head"><div>
        <h3>{selected.label} por mapa</h3>
        <p>{seasonLabel||'Todo o histórico'} · Maior win rate, com desempate pela amostra</p>
      </div></div>
      {byMap.length?<PagedTable label={`${selected.label} por mapa`} rows={byMap}
        pageKey={JSON.stringify([selectedKey,season,activeMode,activeMap])}
        headings={<><th>Mapa</th><th>Win rate</th><th>Pick rate pessoal</th><th>Ações</th></>}
        renderRow={row=><tr key={row.key}>
          <td><span className="image-label"><ModeIcon mode={row.mode}/><span><strong>{row.name}</strong><small>{modeName(row.mode)}</small></span></span></td>
          <td><strong>{percent(row.rate)}</strong><small>{number(row.wins)} V · {number(row.losses)} D</small></td>
          <td><strong>{percent(row.picks/row.known)}</strong><small>{number(row.picks)} de {number(row.known)} partidas com pick identificado</small></td>
          <td><div className="actions">
            <button type="button" className="button small subtle" aria-label={`Abrir Draft Lab em ${row.name}`}
              onClick={()=>onDraft(row.name,seasonLabel)}><FlaskConical size={14}/> Abrir Draft Lab</button>
            <button type="button" className="button small subtle" aria-label={`Treinar com ${selected.label} em ${row.name}`}
              onClick={()=>onTrain(row.name,selected.label)}><Flag size={14}/> Treinar</button>
          </div></td>
        </tr>}/>:<p className="section-note">Sem mapas identificados para este brawler no recorte.</p>}
      {matchups&&<section aria-label="Confrontos do brawler">
        <div className="card-head"><div>
          <h3>{allies?'Aliados':'Confrontos'} de {selected.label}</h3>
          <p>{number(matchups.covered)} de {number(matchups.total)} {matchups.total===1?'partida':'partidas'} com {counterpart.toLowerCase()} identificado</p>
        </div>{matchups.rows.length>1&&<label>{allies?'Ordenar aliados':'Ordenar confrontos'}<select value={hardFirst?'hard':'favorable'}
          onChange={event=>setMatchupOrder({...matchupOrder,[side]:event.target.value==='hard'})}>
          <option value="hard">Partidas, depois derrotas</option>
          <option value="favorable">Partidas, depois vitórias</option>
        </select></label>}</div>
        <div className="view-tabs brawler-matchup-tabs" role="group" aria-label="Lado da composição">
          <button type="button" aria-pressed={!allies} onClick={()=>setSide('opponent')}>Adversários</button>
          <button type="button" aria-pressed={allies} onClick={()=>setSide('ally')}>Aliados</button>
        </div>
        {matchups.rows.length?<><PagedTable label={`${counterpart}s de ${selected.label}`} rows={orderByMatchCount(matchups.rows,hardFirst?'losses':'wins')}
          pageKey={JSON.stringify([selectedKey,season,activeMode,activeMap,side,hardFirst])}
          headings={<><th>{counterpart}</th><th aria-sort="descending">Partidas</th><th>Win rate pessoal</th><th>Últimas partidas</th></>}
          renderRow={row=><tr key={row.key}>
            <td><span className="image-label"><Portrait name={row.name}/>{row.name}</span></td>
            <td>{number(row.games)}</td>
            <td><strong>{percent(row.rate)}</strong><small>{number(row.wins)} V · {number(row.losses)} D</small></td>
            <td><div className="actions">
              {row.defeat&&<button type="button" className="button small subtle" aria-label={`Ver derrota ${relation} ${row.name}`}
                onClick={()=>onMatch(row.defeat!.id)}>Ver derrota</button>}
              {row.victory&&<button type="button" className="button small subtle" aria-label={`Ver vitória ${relation} ${row.name}`}
                onClick={()=>onMatch(row.victory!.id)}>Ver vitória</button>}
            </div></td>
          </tr>}/>
          <p className="section-note">{allies?'Resultados da sua equipe quando esse brawler era aliado.':'Resultados da sua equipe quando enfrentou esse brawler.'} A ordem leva em conta o tamanho da amostra.</p>
        </>:<p className="section-note">Nenhum {counterpart.toLowerCase()} identificado neste recorte.</p>}
      </section>}
    </>:<p className="section-note">Nenhuma partida com brawler identificado neste recorte.</p>}
  </Card>;
}
