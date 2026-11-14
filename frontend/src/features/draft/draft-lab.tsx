import type { PointerEvent } from 'react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Bomb, ChevronDown, ChevronLeft, ChevronRight, Crosshair, Flame, HeartPulse, Map as MapIcon, Search, Shield, SlidersHorizontal, Swords, Target, Undo2, X } from 'lucide-react';
import type { Battle, Dataset, Filters } from '@/lib/data';
import { dateTime, groupStats, modeName, normalize, number, percent } from '@/lib/data';
import { byModeId, brawlers, findMap, MapImage, maps, ModeIcon, pickableModes, Portrait, roleName } from '@/components/game';
import { accountCounters, draftPicks, ordered, publicCounters, publicPicks, usePublicStats } from '@/lib/scouting';
import type { ScoutingRow } from '@/lib/scouting';
import type { MetaMatchup } from '@/lib/browser-store';
import { LiveMeta, metaPeriods } from '@/lib/live';
import type { LivePeriod } from '@/lib/live';
import { draftMetaMapKey, draftMetaPicks } from '@/lib/draftmeta';
import { useDraftMeta } from './use-draftmeta';

type Side = 'team'|'enemy';
type Zone = Side|'blueBan'|'redBan';
type Slot = { side: Zone; index:number };
type DraftState = Record<Zone,string[]>;
type Advice = 'picks'|'bans'|'counters';
const fresh = ():DraftState => ({team:['','',''],enemy:['','',''],blueBan:['','',''],redBan:['','','']});
const rosterNames = new Map(brawlers.map(brawler=>[normalize(brawler.name),brawler.name]));
const banZone = (side:Zone) => side==='blueBan'||side==='redBan';

function ScoutingRows({ rows, onPick, empty, pairs=false, slots, unit='séries', limit=8 }: {
  rows: (ScoutingRow & { synergies?:ScoutingRow['details'] })[]; onPick?: (name:string)=>void;
  empty:string; pairs?:boolean; slots?:number; unit?:string; limit?:number;
}) {
  if(!rows.length)return <div className="draft-empty"><Crosshair size={23}/><p>{empty}</p></div>;
  return <div className="scout-rows">{rows.slice(0,limit).map((row,i)=><div className="scout-row" key={row.name}>
    <span className="scout-index">{i+1}</span><Portrait name={row.name}/><div><strong>{row.name}</strong>
    <small>{pairs ? row.details.map(d=>`${d.name} ${percent(d.wins/d.games)} · n=${number(d.games)}`).join(' / ')
      : `${number(row.games)} ${unit}${slots?' · '+percent((row.pickCount??row.games)/slots)+' dos picks':''}`}</small>
    {!pairs&&row.details.length>0&&<small>Vs. {row.details.map(d=>`${d.name} ${percent(d.wins/d.games)} (n=${d.games})`).join(' · ')}</small>}
    {!pairs&&!!row.synergies?.length&&<small>Com {row.synergies.map(d=>`${d.name} ${percent(d.wins/d.games)} (n=${d.games})`).join(' · ')}</small>}
    </div><span className="win-rate">{pairs&&row.details.length>1?`${row.details.length} alvos`:percent(row.games?row.wins/row.games:null)}</span>
    {onPick&&<button className="button small subtle" onClick={()=>onPick(row.name)}>Usar</button>}
  </div>)}</div>;
}

function pickOrder(first:Side): Slot[] {
  const second=first==='team'?'enemy':'team';
  return [{side:first,index:0},{side:second,index:0},{side:second,index:1},{side:first,index:1},{side:first,index:2},{side:second,index:2}];
}
const classIcons={Assassin:Swords,Tank:Shield,'Damage Dealer':Flame,Controller:SlidersHorizontal,Marksman:Crosshair,Artillery:Bomb,Support:HeartPulse};
const banOrder:Slot[] = [0,1,2].flatMap(index=>[{side:'blueBan',index},{side:'redBan',index}] as Slot[]);

export function DraftLab({ matches,profile,defaultMap,active=true }: {
  matches:Battle[]; profile:Dataset['profile']; defaultMap?:string; active?:boolean;
}) {
  const [mapName,setMapName]=useState(defaultMap??'');
  const [mapOpen,setMapOpen]=useState(false);
  const [mapSearch,setMapSearch]=useState('');
  const [mapPage,setMapPage]=useState(0);
  const [archived,setArchived]=useState(false);
  const [first,setFirst]=useState<Side>('team');
  const [draft,setDraft]=useState(fresh);
  const [slot,setSlot]=useState<Slot>({side:'blueBan',index:0});
  const [phase,setPhase]=useState<'ban'|'pick'>('ban');
  const [history,setHistory]=useState<{draft:DraftState;slot:Slot;phase:'ban'|'pick'}[]>([]);
  const [search,setSearch]=useState('');
  const [rosterRows,setRosterRows]=useState(3);
  const [scrollEdges,setScrollEdges]=useState({left:false,right:false});
  const [compactView,setCompactView]=useState<'roster'|'map'>('roster');
  const [source,setSource]=useState<'draftmeta'|'public'|'account'>('draftmeta');
  const [owned,setOwned]=useState(false);
  const [advice,setAdvice]=useState<Advice>('bans');
  const input=useRef<HTMLInputElement>(null);
  const rail=useRef<HTMLDivElement>(null);
  const drag=useRef<{id:number; x:number; offset:number; moved:boolean}|null>(null);
  const suppressClick=useRef(false);
  const {period,setPeriod,report}=useContext(LiveMeta);
  useEffect(()=>{
    const element=rail.current;
    if(!element)return;
    const resize=new ResizeObserver(([entry])=>{
      if(!entry.contentRect.height)return;
      const tile=Number.parseFloat(getComputedStyle(element).getPropertyValue('--roster-tile'));
      const groupHeader=element.querySelector('h3')?.offsetHeight??28;
      const gap=7;
      const rows=Math.floor((entry.contentRect.height-groupHeader-14+gap)/(tile+gap));
      setRosterRows(Math.min(5,Math.max(1,rows)));
    });
    resize.observe(element);
    return()=>resize.disconnect();
  },[]);
  const map=findMap(mapName)??maps.find(item=>draftMetaMapKey(item.name)===draftMetaMapKey(mapName)&&!item.disabled);
  const mode=map?byModeId.get(map.mode)?.key??null:null;
  const external=useDraftMeta(mapName,active&&source==='draftmeta');
  const global=usePublicStats(null,mapName||null);
  const mapIndex=usePublicStats(null,null);
  const recentMaps=new Set([...external.pool,...(mapIndex.index?.contexts.flatMap(c=>c.map?[c.map]:[])??[])].map(draftMetaMapKey));
  const availableMaps=maps.filter(m=>archived||recentMaps.has(draftMetaMapKey(m.name))||(!m.disabled&&pickableModes.some(mode=>mode.id===m.mode)));
  const distinctMaps=[...new Map([...availableMaps.map(m=>m.name),...external.pool].map(name=>[draftMetaMapKey(name),name])).values()]
    .filter(name=>draftMetaMapKey(name).includes(draftMetaMapKey(mapSearch)))
    .sort((a,b)=>Number(recentMaps.has(draftMetaMapKey(b)))-Number(recentMaps.has(draftMetaMapKey(a)))||a.localeCompare(b));
  const picked=new Set([...draft.team,...draft.enemy].filter(Boolean).map(normalize));
  const banned=new Set([...draft.blueBan,...draft.redBan].filter(Boolean).map(normalize));
  const eligible=new Set(profile?.owned_brawlers?.filter(b=>b.power>=11).map(b=>normalize(b.name))??[]);
  const hasBan=banZone(slot.side);
  const blocked=(name:string,where=slot)=>{
    const key=normalize(name);
    if(picked.has(key))return true;
    if(banZone(where.side))return draft[where.side].some(v=>normalize(v)===key);
    return banned.has(key)||(owned&&where.side==='team'&&!eligible.has(key));
  };
  const contextual=useMemo(()=>matches.filter(b=>!mapName||(map&&b.event_id===map.id)||draftMetaMapKey(b.map_name??'')===draftMetaMapKey(mapName)),[matches,map,mapName]);
  const accountPicks:ScoutingRow[]=groupStats(contextual,b=>[b.player_brawler]).filter(r=>r.decided>=3)
    .map(r=>({name:r.label,wins:r.wins,games:r.decided,details:[]}));
  const general=source==='public'?publicPicks(global.sample):accountPicks;
  const enemies=draft.enemy.filter(Boolean), allies=draft.team.filter(Boolean);
  const suggestedPick=pickOrder(first).find(s=>s.side==='team'&&!draft.team[s.index]);
  const suggestedBan=banOrder.find(s=>s.side==='blueBan'&&!draft.blueBan[s.index]);
  const targetPick=!hasBan&&slot.side==='team'&&!draft.team[slot.index]?slot:suggestedPick;
  const targetBan=slot.side==='blueBan'&&!draft.blueBan[slot.index]?slot:suggestedBan;
  const picks=(source==='public'?draftPicks(global.sample,general,allies,enemies):ordered(general)).filter(r=>targetPick&&!blocked(r.name,targetPick));
  const counters=(source==='public'?publicCounters(global.sample,enemies):accountCounters(contextual,enemies).filter(r=>r.games>=3))
    .filter(r=>targetPick&&!blocked(r.name,targetPick));
  const threats=(source==='public'?general:
    groupStats(contextual,b=>b.players.filter(p=>p.side==='opponent').map(p=>p.brawler)).filter(r=>r.decided>=3)
      .map(r=>({name:r.label,wins:r.losses,games:r.decided,details:[]})))
    .filter(r=>r.games&&targetBan&&!blocked(r.name,targetBan))
    .sort((a,b)=>(b.wins/b.games-.5)*Math.sqrt(b.games)-(a.wins/a.games-.5)*Math.sqrt(a.games));
  const nextPick=pickOrder(first).find(s=>!draft[s.side][s.index]);
  const nextBan=banOrder.find(s=>!draft[s.side][s.index]);
  const next=phase==='ban'?nextBan??nextPick:nextPick;
  const query=normalize(search);
  const available=brawlers.filter(b=>(slot.side!=='team'||!owned||eligible.has(normalize(b.name)))&&normalize(b.name).includes(query));
  const groups=[...new Set([...Object.keys(classIcons),...available.map(b=>b.role)])].map(key=>({
    key, entries:available.filter(b=>b.role===key), Icon:classIcons[key as keyof typeof classIcons]??Swords,
  })).filter(group=>group.entries.length);
  const groupCounts=groups.map(group=>group.entries.length).join(',');
  useEffect(()=>{if(rail.current)rail.current.scrollLeft=0;},[query]);
  useEffect(()=>{
    const element=rail.current;
    if(!element)return;
    function update(){
      const left=element!.scrollLeft>1;
      const right=element!.scrollLeft+element!.clientWidth<element!.scrollWidth-1;
      setScrollEdges(previous=>previous.left===left&&previous.right===right?previous:{left,right});
    }
    const resize=new ResizeObserver(update);
    resize.observe(element);
    element.addEventListener('scroll',update,{passive:true});
    update();
    return()=>{resize.disconnect();element.removeEventListener('scroll',update);};
  },[groupCounts,rosterRows]);

  function startDrag(event:PointerEvent<HTMLDivElement>){
    if(event.pointerType!=='mouse'||event.button!==0)return;
    suppressClick.current=false;
    drag.current={id:event.pointerId,x:event.clientX,offset:event.currentTarget.scrollLeft,moved:false};
  }
  function moveDrag(event:PointerEvent<HTMLDivElement>){
    const current=drag.current;
    if(!current||current.id!==event.pointerId)return;
    if(!event.buttons){drag.current=null;return;}
    const delta=event.clientX-current.x;
    if(!current.moved&&Math.abs(delta)<6)return;
    if(!current.moved){
      current.moved=true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    suppressClick.current=true;
    event.currentTarget.scrollLeft=current.offset-delta;
  }
  function stepRoster(direction:number){
    const element=rail.current;
    if(!element)return;
    const distance=Math.max(100,element.clientWidth*.8);
    element.scrollBy({left:direction*distance,behavior:'auto'});
  }

  const mapPages=Math.max(1,Math.ceil(distinctMaps.length/7));
  const currentMapPage=Math.min(mapPage,mapPages-1);
  const displayedMaps=distinctMaps.slice(currentMapPage*7,(currentMapPage+1)*7);

  function move(to:Slot){
    setSlot(to);setPhase(banZone(to.side)?'ban':'pick');setSearch('');
    setAdvice(banZone(to.side)?'bans':'picks');setCompactView('roster');input.current?.focus({preventScroll:true});
  }
  function assign(name:string,where=slot){
    if(draft[where.side][where.index]===name||(name&&blocked(name,where)))return;
    const modified={...draft,[where.side]:draft[where.side].map((v,i)=>i===where.index?name:v)};
    setHistory(h=>[...h,{draft,slot,phase}]);setDraft(modified);setSearch('');
    if(!name){setSlot(where);return;}
    const nextBan=banZone(where.side)?banOrder.find(s=>!modified[s.side][s.index]):undefined;
    const following=nextBan??pickOrder(first).find(s=>!modified[s.side][s.index]);
    if(following){
      setSlot(following);setPhase(banZone(following.side)?'ban':'pick');
      setAdvice(banZone(following.side)?'bans':'picks');
    }
  }
  function reset(){
    setDraft(fresh());setSlot({side:'blueBan',index:0});setPhase('ban');setAdvice('bans');setHistory([]);setSearch('');
  }
  function renderSlots(zone:Zone){
    return <div className={`arena-slots ${banZone(zone)?'arena-bans':''}`}>{draft[zone].map((name,i)=>{
      const selected=zone===slot.side&&i===slot.index;
      const ordinal=banZone(zone)?i+1:pickOrder(first).findIndex(s=>s.side===zone&&s.index===i)+1;
      return <div className={`arena-slot-wrap ${selected?'selected':''}`} key={i}>
        <button className="arena-slot" aria-label={`${zone==='team'||zone==='blueBan'?'Azul':'Vermelho'} ${banZone(zone)?'ban':'pick'} ${i+1}${name?' '+name:''}`}
          aria-pressed={selected} onClick={()=>move({side:zone,index:i})}>
          {name?<><Portrait name={name}/><span>{name}</span></>:<><span className="slot-mark">{banZone(zone)?<Ban size={15}/>:'+'}</span><span>{banZone(zone)?'Ban':'Pick'} {ordinal}</span></>}
        </button>{name&&<button className="slot-clear" aria-label={`Remover ${name} de ${zone}`} onClick={()=>assign('',{side:zone,index:i})}><X size={12}/></button>}
      </div>;
    })}</div>;
  }
  const recommendations=advice==='picks'?picks:advice==='bans'?threats:counters;
  const externalTarget=advice==='bans'?targetBan:targetPick;
  const externalRows=draftMetaPicks(external.snapshot).flatMap(row=>{
    const rosterName=rosterNames.get(normalize(row.name));
    return rosterName&&externalTarget&&!blocked(rosterName,externalTarget)&&(advice!=='bans'||!banned.has(normalize(rosterName)))?[{...row,name:rosterName}]:[];
  });
  if(advice==='bans')externalRows.sort((a,b)=>(b.presence??0)*Math.max(0,b.winRate-.5)-(a.presence??0)*Math.max(0,a.winRate-.5)||b.winRate-a.winRate);
  const applyRecommendation:((name:string)=>void)|undefined=advice==='bans'?(targetBan?name=>assign(name,targetBan):undefined):
    (targetPick?name=>assign(name,targetPick):undefined);
  const composition=(line:string[])=>[...new Set(line.flatMap(name=>{
    const item=brawlers.find(b=>normalize(b.name)===normalize(name));
    return item?[item.role]:[];
  }))].map(roleName);
  return <div className={`draft-workstation compact-view-${compactView}`}>
    <div className="draft-switch"><button aria-pressed={compactView==='roster'} onClick={()=>setCompactView('roster')}>Brawlers</button>
      <button aria-pressed={compactView==='map'} onClick={()=>setCompactView('map')}>Mapa e recomendações</button></div>
    <section className="card draft-lineup" aria-label="Picks e bans das equipes">
      <header className="draft-panel-title"><h2>Picks e bans</h2><div className="actions">
        <button className="button small subtle icon-only" aria-label="Desfazer última ação" title="Desfazer" disabled={!history.length}
          onClick={()=>{const last=history.at(-1)!;setDraft(last.draft);setSlot(last.slot);setPhase(last.phase);setAdvice(last.phase==='ban'?'bans':'picks');setHistory(h=>h.slice(0,-1));}}>
          <Undo2 size={15}/></button><button className="button small subtle" onClick={reset}>Novo</button></div></header>
      <div className="draft-first"><span>Primeira escolha</span><div className="starter-buttons">
        <button aria-pressed={first==='team'} className="blue" onClick={()=>{setFirst('team');if(!picked.size&&phase==='pick')setSlot({side:'team',index:0});}}>Azul</button>
        <button aria-pressed={first==='enemy'} className="red" onClick={()=>{setFirst('enemy');if(!picked.size&&phase==='pick')setSlot({side:'enemy',index:0});}}>Vermelho</button>
      </div></div>
      <div className="arena-team blue"><h2>Sua equipe <span>AZUL</span></h2>{renderSlots('team')}<h3><Ban size={12}/> Bans</h3>{renderSlots('blueBan')}
        {!!composition(draft.team).length&&<div className="team-roles">{composition(draft.team).join(' · ')}</div>}</div>
      <div className="arena-team red"><h2>Adversários <span>VERMELHO</span></h2>{renderSlots('enemy')}<h3><Ban size={12}/> Bans</h3>{renderSlots('redBan')}
        {!!composition(draft.enemy).length&&<div className="team-roles">{composition(draft.enemy).join(' · ')}</div>}</div>
      <div className="draft-stage">
        <div><small>{phase==='ban'&&nextBan?'FASE DE BANS':nextPick?'FASE DE PICKS':'DRAFT COMPLETO'}</small>
          <strong>{next?(next.side==='team'||next.side==='blueBan'?'Azul':'Vermelho'):'6 / 6'}</strong></div>
        <div className="pick-timeline">{pickOrder(first).map((s,i)=><span key={i} className={`${s.side==='team'?'blue':'red'} ${draft[s.side][s.index]?'filled':''}`}>{i+1}</span>)}</div>
        {phase==='ban'&&nextPick&&<button className="text-button" onClick={()=>move(nextPick)}>Ir para picks</button>}
      </div>
    </section>
    <section className="card draft-field" aria-label="Mapa e recomendações">
      <div className="draft-map-feature">
        <button className="draft-map-button" aria-expanded={mapOpen} onClick={()=>{setMapOpen(v=>!v);setMapSearch('');setMapPage(0);}}>
          <span className="draft-map-label"><span><MapIcon size={14}/> {mapName||'Escolher mapa'}</span><ChevronDown size={16}/></span>
          <span className="draft-map-picture"><MapImage map={map}/></span>
          {mode&&<span className="image-label"><ModeIcon mode={mode}/>{modeName(mode)}</span>}
        </button>
        {mapOpen&&<div className="map-menu"><label><Search size={15}/><input autoFocus value={mapSearch} aria-label="Buscar mapa" placeholder="Buscar mapa"
          onChange={e=>{setMapSearch(e.target.value);setMapPage(0);}} onKeyDown={e=>{if(e.key==='Escape')setMapOpen(false);}}/></label>
          <button className="map-option" onClick={()=>{setMapName('');setMapOpen(false);}}>Todos os mapas</button>
          {displayedMaps.map(name=>{
            const item=findMap(name)??availableMaps.find(m=>draftMetaMapKey(m.name)===draftMetaMapKey(name));
            return <button className="map-option" key={name} onClick={()=>{setMapName(name);setMapOpen(false);}}>
              <MapImage map={item}/><span>{name}{item&&<small>{modeName(byModeId.get(item.mode)?.key??null)}</small>}</span></button>;
          })}
          {!displayedMaps.length&&<p className="section-note">Nenhum mapa encontrado.</p>}
          {mapPages>1&&<div className="draft-pagination"><button aria-label="Página anterior de mapas" disabled={!currentMapPage} onClick={()=>setMapPage(currentMapPage-1)}><ChevronLeft size={16}/></button>
            <span>{currentMapPage+1} / {mapPages}</span><button aria-label="Próxima página de mapas" disabled={currentMapPage+1>=mapPages} onClick={()=>setMapPage(currentMapPage+1)}><ChevronRight size={16}/></button></div>}
          <label className="checkbox map-archive"><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setMapPage(0);}}/> Incluir mapas arquivados</label>
        </div>}
      </div>
      <div className="draft-recommendations">
        <header className="draft-panel-title"><h2><Target size={15}/> Recomendações</h2>
          <select aria-label="Fonte das recomendações" value={source} onChange={e=>setSource(e.target.value as typeof source)}><option value="draftmeta">DraftMeta</option><option value="public">Amostra própria e histórico</option><option value="account">Minha conta</option></select></header>
        {source==='public'&&<select className="draft-period-select" aria-label="Período das recomendações" value={period} onChange={e=>setPeriod(e.target.value as LivePeriod)}>
          {metaPeriods(report).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>}
        <div className="tabs">{(['picks','bans','counters'] as Advice[]).map(t=><button key={t} aria-pressed={advice===t} onClick={()=>setAdvice(t)}>
          {t==='picks'?'Picks':t==='bans'?'Bans':'Counters'}</button>)}</div>
        {source==='draftmeta'?<>
          <div className="draft-suggestions" aria-live="polite">
            {advice==='counters'?<p className="section-note">Counters por mapa indisponíveis neste snapshot. Consulte outra fonte no seletor.</p>:
              external.loading?<p className="section-note">Carregando Meta do patch…</p>:
              external.failed?<p className="section-note">Não foi possível ler o snapshot do DraftMeta.</p>:
              !external.snapshot?<p className="section-note">Sem snapshot salvo para este {mapName?'mapa':'recorte'} no patch{external.patch?` de ${external.patch.split('-').reverse().join('/')}`:''}.</p>:
              !externalRows.length?<p className="section-note">Sem sugestões disponíveis para esta posição.</p>:
              externalRows.slice(0,3).map(row=><button type="button" className="draft-suggestion" key={row.name}
                disabled={!applyRecommendation} onClick={()=>applyRecommendation?.(row.name)}>
                <Portrait name={row.name}/><span><strong>{row.name} · {row.tier}</strong>
                  <small>{number(row.games)} partidas · {row.presence===null?'Presença —':`${percent(row.presence)} presença`}</small></span>
                <b>{percent(row.winRate)}</b>
              </button>)}
          </div>
          {external.snapshot&&<p className="draft-evidence"><a href={external.snapshot.source_url} target="_blank" rel="noreferrer">DraftMeta</a>
            {' · Patch '+external.snapshot.patch_date.split('-').reverse().join('/')+' · '+dateTime(external.snapshot.fetched_at)}
            {!external.snapshot.fresh&&' · Cópia salva'}
            {advice==='bans'&&' · Sugestões por força no recorte'}</p>}
        </>:<>
        <div className="draft-suggestions">
          {!recommendations.length&&<p className="section-note">{advice==='counters'&&!enemies.length?'Adicione um pick adversário.':global.loading?'Carregando…':'Sem amostra neste recorte.'}</p>}
          {recommendations.slice(0,3).map(r=>{
            const text=[...r.details,...('synergies' in r ? r.synergies as ScoutingRow['details'] : [])].map(d=>`${d.name} ${percent(d.wins/d.games)} · n=${d.games}`).join(' / ');
            return <button className="draft-suggestion" key={r.name} disabled={!applyRecommendation} title={text||`${r.games} observações decisivas`}
              onClick={()=>applyRecommendation?.(r.name)}><Portrait name={r.name}/><span><strong>{r.name}</strong>
                <small>{r.details.length>1?r.details.length+' adversários':'n = '+number(r.games)}</small></span>
                <b>{r.details.length>1?'↗':percent(r.games?r.wins/r.games:null)}</b></button>;
          })}
        </div>
        {recommendations.length>0&&<p className="draft-evidence">{advice==='bans'?'Sugestão por força e frequência':advice==='counters'?'Confrontos observados':'Win rate, counters e sinergias'}</p>}
        </>}
      </div>
    </section>
    <section className="card draft-roster" aria-label="Brawlers por classe">
      <header className="draft-panel-title"><div><h2>Brawlers</h2><p>{hasBan?'Ban':'Pick'} · {slot.side==='team'||slot.side==='blueBan'?'Azul':'Vermelho'} · posição {slot.index+1}</p></div>
        <label className="draft-search"><Search size={15}/><input ref={input} aria-label="Buscar brawler" value={search}
          onChange={e=>setSearch(e.target.value)} placeholder="Buscar brawler"
          onKeyDown={e=>{if(e.key==='Enter'&&available.length===1&&!blocked(available[0].name))assign(available[0].name);}}/></label></header>
      <div className="draft-roster-guide"><span>{query?number(available.length)+(available.length===1?' encontrado':' encontrados'):'Arraste para ver as classes'}</span>
        <div className="draft-pagination"><button aria-label="Rolar brawlers para a esquerda" disabled={!scrollEdges.left} onClick={()=>stepRoster(-1)}><ChevronLeft size={16}/></button>
          <button aria-label="Rolar brawlers para a direita" disabled={!scrollEdges.right} onClick={()=>stepRoster(1)}><ChevronRight size={16}/></button></div></div>
      <div ref={rail} className="draft-roster-rail" aria-label="Faixa de brawlers por classe" tabIndex={0}
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
        onClickCapture={e=>{if(suppressClick.current&&e.detail){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}
        onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();stepRoster(e.key==='ArrowRight'?1:-1);}}}>
        {groups.map(({key,Icon,entries})=><section className="draft-class" key={key}>
          <h3><Icon size={16}/>{roleName(key)} <span>{entries.length}</span></h3>
          <div className="draft-class-grid" style={{gridTemplateRows:`repeat(${Math.min(rosterRows,entries.length)}, var(--roster-tile))`}}>
            {entries.map(b=><button key={b.id} className="roster-brawler" disabled={blocked(b.name)}
              onClick={()=>assign(b.name)} title={`${b.name} · ${roleName(b.role)}`}>
              <Portrait id={b.id}/><span>{b.name}</span></button>)}
          </div>
        </section>)}
        {!available.length&&<p className="section-note">Nenhum brawler encontrado.</p>}
      </div>
      {!!profile?.owned_brawlers?.length&&<label className="checkbox draft-owned"><input type="checkbox" checked={owned} onChange={e=>setOwned(e.target.checked)}/> Só meus picks de poder 11</label>}
    </section>
  </div>;
}

export function CounterFinder({ matches, mode, map, filters, imported }: {
  matches: Battle[]; mode: string; map: string; filters: Filters; imported: MetaMatchup[];
}) {
  const [target,setTarget] = useState('');
  const [source,setSource] = useState<'public'|'account'|'imported'>('public');
  const [cohort,setCohort] = useState('');
  const meta = usePublicStats(mode || (map ? byModeId.get(findMap(map)?.mode ?? 0)?.key : null) || null,map||null,filters);
  const strong = ordered(publicPicks(meta.sample)).slice(0,5);
  const cohortKey = (r:MetaMatchup)=>[r.source_name,r.source_url,r.period_start,r.period_end,r.mode,r.map_name,r.rank_label,r.season].join('|');
  const matching=imported.filter(r=>normalize(r.opponent)===normalize(target) &&
    (!mode||normalize(r.mode)===normalize(mode)) && (!map||normalize(r.map_name)===normalize(map)) &&
    (!filters.rank_label||normalize(r.rank_label)===normalize(filters.rank_label)) &&
    (!filters.season||normalize(r.season)===normalize(filters.season)) &&
    (!filters.start||r.period_start>=filters.start) && (!filters.end||r.period_end<=filters.end));
  const sources=[...new Map(matching.map(r=>[cohortKey(r),r])).entries()];
  const active=sources.find(([key])=>key===cohort)??sources[0];
  const rows = source==='public' ? publicCounters(meta.sample,target?[target]:[]) : source==='account' ? accountCounters(matches,target?[target]:[]):
    ordered(matching.filter(r=>cohortKey(r)===active?.[0]).map(r=>({name:r.brawler,wins:r.wins,games:r.games,details:[{name:r.opponent,wins:r.wins,games:r.games}]})));
  return <section className="card"><div className="card-head"><div><h2><Crosshair size={17}/>Encontrar counters</h2><p>Compare resultados observados contra um brawler específico.</p></div></div>
    <div className="counter-controls"><label>Brawler adversário<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Selecione um brawler</option>
      {brawlers.map(b=><option key={b.id}>{b.name}</option>)}</select></label>
      <label>Fonte<select value={source} onChange={e=>setSource(e.target.value as typeof source)}><option value="public">Amostra pública</option><option value="account">Minha conta</option>
        {!!imported.length&&<option value="imported">Arquivo importado</option>}</select></label>
      {source==='imported'&&sources.length>1&&<label>Recorte importado<select value={active?.[0]??''} onChange={e=>setCohort(e.target.value)}>
        {sources.map(([key,r])=><option key={key} value={key}>{[r.source_name,r.period_start,r.period_end,r.map_name,r.mode,r.rank_label,r.season].filter(Boolean).join(' · ')}</option>)}</select></label>}</div>
    {strong.length > 0 && <div className="quick-targets"><span>Brawlers fortes na amostra</span>{strong.map(b =>
      <button key={b.name} className="button small subtle" onClick={()=>{setTarget(b.name);setSource('public');}}><Portrait name={b.name}/>{b.name}</button>)}</div>}
    {rows.length ? <div className="counter-sides">
      <div><h3>Melhores respostas</h3><ScoutingRows rows={ordered(rows)} pairs limit={5} empty="Sem observações."/></div>
      <div><h3>Confrontos mais difíceis</h3><ScoutingRows rows={ordered(rows,true)} pairs limit={5} empty="Sem observações."/></div>
    </div>:<ScoutingRows rows={rows} pairs empty={target?'Sem observações suficientes neste recorte.':'Escolha um alvo ou selecione um dos brawlers destacados.'}/>}
    {source==='public'&&meta.index&&<div className="scout-foot"><a href={meta.index.url} target="_blank" rel="noreferrer">{meta.index.source}</a> · {meta.index.start} a {meta.index.end} · {meta.index.unit??'séries'} decisivos</div>}
    {source==='imported'&&active&&<div className="scout-foot"><a href={active[1].source_url} target="_blank" rel="noreferrer">{active[1].source_name}</a> · {active[1].period_start} a {active[1].period_end}</div>}
  </section>;
}
