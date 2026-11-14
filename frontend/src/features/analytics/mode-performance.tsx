import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, Empty } from '@/components/dashboard-ui';
import { findMap, MapImage, ModeIcon, Portrait } from '@/components/game';
import { groupStats, modeName, normalize, number, percent, stats } from '@/lib/data';
import type { Battle } from '@/lib/data';
import { draftMetaMapKey } from '@/lib/draftmeta';
import { ordered } from '@/lib/scouting';

const modeKey=(battle: Battle)=>normalize(battle.mode);
const mapKey=(battle: Battle)=>JSON.stringify([modeKey(battle),draftMetaMapKey(battle.map_name??'')]);
const playerPick=(battle: Battle)=>[battle.player_brawler];
const opponents=(battle: Battle)=>battle.players.filter(p=>p.side==='opponent').map(p=>p.brawler);

function breakdown(rows: Battle[], key: (battle:Battle)=>string) {
  const groups=new Map<string,Battle[]>();
  for(const row of rows){
    const id=key(row);
    const group=groups.get(id);
    if(group)group.push(row);
    else groups.set(id,[row]);
  }
  return [...groups].map(([id,battles])=>({id,battle:battles[0],...stats(battles)}))
    .sort((a,b)=>b.games-a.games);
}

type BrawlerStats=ReturnType<typeof groupStats>[number];
function sortBrawlers(rows: BrawlerStats[], worst=false) {
  return ordered(rows.map(row=>({...row,games:row.decided,total:row.games})),worst);
}

function RecordLine({ row }: { row: ReturnType<typeof stats> }) {
  const unknown=row.games-row.decided-row.draws;
  return <small>{number(row.wins)} V · {number(row.losses)} D{row.draws>0&&` · ${number(row.draws)} E`}
    {unknown>0&&` · ${number(unknown)} sem resultado`}</small>;
}

function WinRate({ row }: { row: ReturnType<typeof stats> }) {
  return <><strong>{percent(row.rate)}</strong>{row.rate!==null&&
    <progress className="mode-rate" value={row.rate} max={1} aria-label="Taxa de vitória"/>}<RecordLine row={row}/></>;
}

function BrawlerTable({ title, rows, worst=false }: { title:string; rows:BrawlerStats[]; worst?:boolean }) {
  return <div className="mode-brawler-table"><h3>{title}</h3>
    {rows.length?<div className="table-wrap" tabIndex={0} role="region" aria-label={title}><table>
      <thead><tr><th>Brawler</th><th>Win rate</th><th>Partidas</th></tr></thead>
      <tbody>{sortBrawlers(rows,worst).map(row=><tr key={row.label}><td><span className="image-label">
        <Portrait name={row.label}/>{row.label}</span></td><td><WinRate row={{...row,games:row.total}}/></td>
        <td>{number(row.total)}</td></tr>)}</tbody>
    </table></div>:<p className="muted">Sem brawlers identificados neste recorte.</p>}
  </div>;
}

export function ModePerformance({ rows }: { rows:Battle[] }) {
  const [mode,setMode]=useState('');
  const [map,setMap]=useState('');
  const [pick,setPick]=useState('');
  const modes=useMemo(()=>breakdown(rows.filter(b=>b.mode),modeKey),[rows]);
  const activeMode=modes.some(row=>row.id===mode)?mode:'';
  const modeRows=useMemo(()=>activeMode?rows.filter(b=>modeKey(b)===activeMode):rows,[rows,activeMode]);
  const maps=useMemo(()=>breakdown(modeRows.filter(b=>b.map_name),mapKey),[modeRows]);
  const activeMap=maps.some(row=>row.id===map)?map:'';
  const scoped=useMemo(()=>activeMap?modeRows.filter(b=>mapKey(b)===activeMap):modeRows,[modeRows,activeMap]);
  const picks=useMemo(()=>groupStats(scoped,playerPick),[scoped]);
  const activePick=picks.some(row=>row.label===pick)?pick:'';
  const enemyRows=useMemo(()=>groupStats(activePick?scoped.filter(b=>normalize(b.player_brawler)===normalize(activePick)):scoped,opponents),
    [scoped,activePick]);
  const total=stats(scoped);
  const mapBattle=maps.find(row=>row.id===activeMap)?.battle;
  const currentMode=modes.find(row=>row.id===activeMode)?.battle.mode;
  const current=mapBattle?.map_name??(currentMode?modeName(currentMode):'Todos os modos');
  const best=sortBrawlers(picks).find(row=>row.decided>=3&&row.wins>row.losses);
  const hardest=sortBrawlers(enemyRows,true).find(row=>row.decided>=3&&row.losses>row.wins);
  return <Card title="Desempenho por modo e mapa" icon={BarChart3}
    sub="Histórico ranqueado da conta · Win rate = vitórias ÷ (vitórias + derrotas)" className="mode-performance">
    {rows.length?<>
      <div className="mode-filters">
        <label>Modo<select value={activeMode} onChange={e=>{setMode(e.target.value);setMap('');setPick('');}}>
          <option value="">Todos os modos</option>
          {modes.map(({id,battle})=><option key={id} value={id}>{modeName(battle.mode)}</option>)}
        </select></label>
        <label>Mapa<select value={activeMap} onChange={e=>{setMap(e.target.value);setPick('');}}>
          <option value="">Todos os mapas</option>
          {maps.map(({id,battle})=><option key={id} value={id}>{battle.map_name}</option>)}
        </select></label>
      </div>
      <div className="mode-summary">
        {mapBattle&&<MapImage map={findMap(mapBattle.map_name,mapBattle.event_id,mapBattle.mode)}/>}
        <div><h3>{current}</h3><strong>{percent(total.rate)}</strong> <span>em {number(total.games)} {total.games===1?'partida':'partidas'}</span><RecordLine row={total}/></div>
        {best&&<div><small>Melhor pick próprio</small><span className="image-label"><Portrait name={best.label}/>
          <strong>{best.label}</strong></span><small>{percent(best.rate)} · {number(best.decided)} decisivas</small></div>}
        {hardest&&<div><small>Adversário mais difícil{activePick&&` com ${activePick}`}</small><span className="image-label"><Portrait name={hardest.label}/>
          <strong>{hardest.label}</strong></span><small>{percent(hardest.rate)} · {number(hardest.decided)} decisivas</small></div>}
      </div>
      <div className="mode-tables">
        {[{label:'Modos',entries:modes,selected:activeMode,select:(id:string)=>{setMode(id);setMap('');setPick('');},map:false},
          {label:'Mapas',entries:maps,selected:activeMap,select:(id:string)=>{setMap(id);setPick('');},map:true}].map(group=>
          <div key={group.label}><h3>{group.label}</h3>{group.entries.length?
            <div className="table-wrap" tabIndex={0} role="region" aria-label={group.label}><table>
              <thead><tr><th>{group.map?'Mapa':'Modo'}</th><th>Win rate</th><th>Partidas</th></tr></thead>
              <tbody>{group.entries.map(row=><tr key={row.id}><td><button type="button" className="text-button image-label"
                aria-pressed={group.selected===row.id} onClick={()=>group.select(group.selected===row.id?'':row.id)}>
                <ModeIcon mode={row.battle.mode}/>{group.map?row.battle.map_name:modeName(row.battle.mode)}</button></td>
                <td><WinRate row={row}/></td><td>{number(row.games)}</td></tr>)}</tbody>
            </table></div>:<p className="muted">Nenhum registro identificado.</p>}</div>)}
      </div>
      <div className="mode-filters mode-matchup-filter"><label>Seu brawler nos confrontos<select value={activePick} onChange={e=>setPick(e.target.value)}>
        <option value="">Todos os seus brawlers</option>
        {picks.map(row=><option key={row.label}>{row.label}</option>)}
      </select></label></div>
      <div className="mode-tables">
        <BrawlerTable title="Com quem você ganha" rows={picks}/>
        <BrawlerTable title={activePick?`Contra quem ${activePick} tem mais dificuldade`:'Contra quem você perde'} rows={enemyRows} worst/>
      </div>
      <p className="section-note">Os confrontos mostram o resultado da sua equipe quando o adversário estava do outro lado. Os destaques exigem pelo menos três partidas decisivas e levam em conta o tamanho da amostra.</p>
    </>:<Empty icon={BarChart3} title="Sem partidas ranqueadas no recorte"/>}
  </Card>;
}
