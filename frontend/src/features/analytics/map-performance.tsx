import { useEffect, useMemo, useState } from 'react';
import { Flag, MapPinned, Swords, Target } from 'lucide-react';
import { findMap, MapImage, ModeIcon, Portrait } from '@/components/game';
import { dateTime, groupStats, modeName, normalize, number, percent, resultName } from '@/lib/data';
import type { Battle } from '@/lib/data';
import type { ReplayReview, TrainingPlan } from '@/lib/coaching';
import { MAP_MIN_GAMES, mapPerformance, reviewPair, trainingResults } from '@/lib/coaching';
import { accountInExternalScope, mapKey } from '@/lib/external-comparison';
import { collectionRequest } from '@/lib/live';
import { ordered } from '@/lib/scouting';
import { AccountComparison } from '@/features/meta/external-account';
import { ReplayAnnotation } from './replay-annotation';
import type { Snapshot } from '@/features/meta/external-meta';

type MapPerformance = ReturnType<typeof mapPerformance>[number];

function MapRanking({ title, rows, active, onChoose }: {
  title:string; rows:MapPerformance[]; active:string; onChoose:(map:string)=>void;
}) {
  return <section className="card coaching-card"><div className="card-head"><div><h2><MapPinned size={17}/> {title}</h2></div></div>
    {rows.length?<div className="rank-rows">{rows.slice(0,5).map(row=><button className="rank-row coaching-map-row"
      key={row.key} aria-pressed={active===row.key} onClick={()=>onChoose(row.key)}>
      <MapImage map={findMap(row.name,null,row.mode)}/><div><strong>{row.name}</strong>
        <small>{number(row.summary.decided)} decisivas{row.recent.decided?` · Últimas ${row.recent.decided} ${percent(row.recent.rate)}`:''}</small></div>
      <span className="rate-track" aria-hidden="true"><i style={{width:`${(row.summary.rate??0)*100}%`}}/></span>
      <strong className="row-rate">{percent(row.summary.rate)}</strong>
    </button>)}</div>:<p className="section-note">Aguardando mapas com pelo menos {MAP_MIN_GAMES} partidas decisivas.</p>}
  </section>;
}


function MatchReview({match,review,onOpen,onSave}: {match:Battle;review?:ReplayReview;
  onOpen:(id:string)=>void; onSave:(id:string,review:ReplayReview)=>Promise<void>;
}) {
  return <section className="card coaching-card"><div className="card-head"><div><h2><Swords size={17}/> {resultName(match.result)}</h2>
    <p>{dateTime(match.played_at)} · {match.player_brawler??'Brawler indisponível'}</p></div>
    <button className="button small subtle" onClick={()=>onOpen(match.id)}>Ver partida</button></div>
    {(['ally','opponent'] as const).map(side=>{
      const players=match.players.filter(player=>player.side===side||(side==='ally'&&player.side==='self'));
      return <div className="coaching-team" key={side}><span>{side==='ally'?'Sua equipe':'Adversários'}</span>
        {players.length?players.map((player,index)=><Portrait key={index} name={player.brawler} id={player.brawler_id} alt={player.brawler??'Brawler'}/>):'—'}</div>;
    })}
    <p className="section-note">Bans · {match.bans===null?'Indisponíveis':match.bans.join(', ')||'Nenhum registrado'}</p>
    <ReplayAnnotation review={review} onSave={value=>onSave(match.id,value)}/>
  </section>;
}

function MapSheet({map, history, accountName, reviews, onOpen, onReview, onDraft}: {
  map:MapPerformance; history:Battle[]; accountName:string; reviews:Record<string,ReplayReview>;
  onOpen:(id:string)=>void; onReview:(id:string,review:ReplayReview)=>Promise<void>; onDraft:(map:string)=>void;
}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [updating,setUpdating]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    void collectionRequest<{snapshot:Snapshot|null}>(`/api/meta/external?${new URLSearchParams({map:map.name})}`,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setSnapshot(result.snapshot);})
      .catch(()=>{if(!controller.signal.aborted)setError('A referência competitiva está indisponível.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[map.name]);
  async function updateReference() {
    setUpdating(true);setError('');
    try{
      const result=await collectionRequest<{snapshot:Snapshot}>('/api/meta/external',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({map:map.name}),
      });
      setSnapshot(result.snapshot);
    }catch(error){setError(error instanceof Error?error.message:'Não foi possível atualizar a referência.');}
    finally{setUpdating(false);}
  }
  const picks=ordered(groupStats(map.rows, row=>[row.player_brawler]).filter(row=>row.decided>0)
    .map(row=>({...row,name:row.label,games:row.decided})));
  const options=picks.filter(row=>row.decided>=3&&row.wins>row.losses).slice(0,2);
  const {victory,defeat}=reviewPair(map.rows);
  const tags=new Map<string,number>();
  for(const match of map.rows){
    const tag=reviews[match.id]?.tag;
    if(tag){
      const key=`${resultName(match.result)} · ${tag}`;
      tags.set(key,(tags.get(key)??0)+1);
    }
  }
  const benchmarkMatches=snapshot?accountInExternalScope(history,snapshot):[];
  const pickRates=new Map((snapshot?.presence??snapshot?.map_picks)?.map(row=>[row.name,row.pick_rate]));
  return <>
    <section className="card coaching-card"><div className="card-head"><div className="coaching-map-title"><MapImage map={findMap(map.name,null,map.mode)}/>
      <div><h2>{map.name}</h2><p className="image-label"><ModeIcon mode={map.mode}/>{modeName(map.mode)}</p></div></div>
      <button className="button small subtle" onClick={()=>onDraft(map.name)}>Abrir no Draft Lab</button></div>
      <div className="collector-readings">
        <div><span>Win rate</span><strong>{percent(map.summary.rate)}</strong><small>{number(map.summary.decided)} decisivas</small></div>
        <div><span>Resultados</span><strong>{number(map.summary.wins)} V · {number(map.summary.losses)} D</strong><small>{number(map.summary.draws)} empates</small></div>
        <div><span>Forma recente</span><strong>{percent(map.recent.rate)}</strong><small>{map.recent.decided} decisivas mais recentes</small></div>
        <div><span>Forma anterior</span><strong>{percent(map.previous.rate)}</strong><small>{map.previous.decided?`${map.previous.decided} decisivas anteriores`:'Aguardando mais partidas'}</small></div>
      </div>
      {picks.length>0&&<div className="coaching-picks">{picks.slice(0,5).map(row=><div key={row.name}>
        <Portrait name={row.name}/><span><strong>{row.name}</strong><small>{percent(row.rate)} · {number(row.decided)} decisivas</small></span></div>)}</div>}
      {options.length>0&&<p className="section-note">Com base no seu histórico · Pick para repetir {options[0].name}{options[1]?` · Alternativa ${options[1].name}`:''}</p>}
    </section>
    <section className="card coaching-card"><div className="card-head"><div><h2>Referência competitiva do mapa</h2>
      <p>{snapshot?`DraftMeta · Patch ${snapshot.patch_date.split('-').reverse().join('/')} · ${snapshot.start} a ${snapshot.end}`:loading?'Carregando snapshot…':'Aguardando snapshot do DraftMeta.'}</p></div>
      <button className="button small subtle" onClick={()=>void updateReference()} disabled={loading||updating}>{updating?'Atualizando…':'Atualizar referência'}</button></div>
      {error&&<p className="section-note" role="status">{error}</p>}
      {snapshot&&<p className="section-note">A comparação abaixo usa a janela do DraftMeta e o histórico da conta nesse mapa. Os cartões acima usam os filtros de Desempenho.</p>}
    </section>
    {snapshot&&<AccountComparison matches={benchmarkMatches} accountName={accountName} tiers={snapshot.tiers}
      pickRates={pickRates} sourceUrl={snapshot.source_url}/>}
    <section className="card coaching-card"><div className="card-head"><div><h2>Revisão de partidas</h2>
      <p>{victory&&defeat&&normalize(victory.player_brawler)===normalize(defeat.player_brawler)&&victory.player_brawler?
        `Vitória e derrota com ${victory.player_brawler}`:'Compare os resultados e anote o que observou no replay do jogo.'}</p></div></div>
      {tags.size>0&&<div className="coaching-tags">{[...tags].sort((a,b)=>b[1]-a[1]).map(([tag,count])=><span key={tag} className="tag">{tag} · {count}</span>)}</div>}
      {!victory&&!defeat&&<p className="section-note">Aguardando vitórias ou derrotas no recorte.</p>}
    </section>
    <div className="two-col equal">{[victory,defeat].flatMap(match=>match?[<MatchReview key={match.id} match={match} review={reviews[match.id]}
      onOpen={onOpen} onSave={onReview}/>]:[])}</div>
  </>;
}

function SessionPlan({strong,weak,plan,history,onChoose,onSave}: {
  strong?:MapPerformance; weak?:MapPerformance; plan?:TrainingPlan; history:Battle[];
  onChoose:(key:string)=>void; onSave:(plan:TrainingPlan)=>Promise<void>;
}) {
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const observed=plan?.startedAt?trainingResults(history,plan):null;
  const suggestion=weak?`Rever uma derrota em ${weak.name} e testar um ajuste de cada vez.`:'Rever uma partida e escolher um ajuste para testar.';
  return <section className="card coaching-card"><div className="card-head"><div><h2><Flag size={17}/> Próxima sessão</h2>
    <p>Escolha um ajuste que você consegue observar durante a partida.</p></div></div>
    <div className="coaching-tags">
      {strong&&<button className="button small subtle" onClick={()=>onChoose(strong.key)}>Consolidar · {strong.name}</button>}
      {weak&&<button className="button small subtle" onClick={()=>onChoose(weak.key)}>Treinar · {weak.name}</button>}
    </div>
    <form className="coaching-form" onSubmit={async event=>{
      event.preventDefault();
      const form=new FormData(event.currentTarget);
      const focus=String(form.get('focus')??'').trim();
      if(!focus||saving)return;
      setSaving(true);setMessage('');
      try{await onSave({focus,completed:form.has('completed')});setMessage('Plano salvo neste navegador.');}
      catch(error){setMessage(error instanceof Error?error.message:'Falha ao salvar o plano.');}
      finally{setSaving(false);}
    }}>
      <label>Ajuste para testar<input name="focus" maxLength={240} required defaultValue={plan?.focus??''} placeholder={suggestion}/></label>
      <label className="checkbox"><input name="completed" type="checkbox" defaultChecked={plan?.completed??false}/> Consegui executar o ajuste</label>
      <div className="actions"><button className="button small subtle" disabled={saving}>{saving?'Salvando…':'Salvar plano'}</button>
        {message&&<span role="status" className="muted">{message}</span>}</div>
    </form>
    {observed&&<p className="section-note">Desde que você salvou o ajuste{plan?.completed?' até marcar como concluído':''} · {number(observed.games)} ranqueadas · {number(observed.wins)} V · {number(observed.losses)} D · {percent(observed.rate)} de win rate</p>}
  </section>;
}

export function MapTraining({rows,history,accountName,reviews,plan,selectedMap,onOpen,onReview,onPlan,onDraft}: {
  rows:Battle[]; history:Battle[]; accountName:string; reviews:Record<string,ReplayReview>; plan?:TrainingPlan;
  selectedMap:string; onOpen:(id:string)=>void; onReview:(id:string,review:ReplayReview)=>Promise<void>;
  onPlan:(plan:TrainingPlan)=>Promise<void>; onDraft:(map:string)=>void;
}) {
  const maps=useMemo(()=>mapPerformance(rows),[rows]);
  const [map,setMap]=useState('');
  const active=maps.find(row=>row.key===(selectedMap?mapKey(selectedMap):map));
  const eligible=maps.filter(row=>row.summary.decided>=MAP_MIN_GAMES)
    .map(row=>({...row,wins:row.summary.wins,games:row.summary.decided}));
  const best=ordered(eligible), worst=ordered(eligible,true);
  const strong=best.find(row=>row.summary.wins>row.summary.losses);
  const weak=worst.find(row=>row.summary.losses>row.summary.wins);
  return <>
    {!selectedMap&&<div className="two-col equal">
      <MapRanking title="Melhores mapas" rows={best} active={map} onChoose={setMap}/>
      <MapRanking title="Piores mapas" rows={worst} active={map} onChoose={setMap}/>
    </div>}
    <section className="card coaching-card"><div className="card-head"><div><h2><Target size={17}/> Ficha do mapa</h2>
      <p>Explore qualquer mapa jogado, mesmo com uma amostra pequena.</p></div></div>
      {selectedMap&&!active&&<p className="section-note">Nenhuma partida nesse mapa com os filtros atuais.</p>}
      <div className="counter-controls"><label>Mapa da ficha<select value={active?.key??''} disabled={!!selectedMap} onChange={event=>setMap(event.target.value)}>
        <option value="">{maps.length?'Selecione um mapa':'Sem mapas no recorte'}</option>{maps.map(row=><option key={row.key} value={row.key}>{row.name}</option>)}
      </select></label></div>
    </section>
    {active&&<MapSheet key={active.key} map={active} history={history} accountName={accountName} reviews={reviews}
      onOpen={onOpen} onReview={onReview} onDraft={onDraft}/>}
    <SessionPlan history={history} strong={strong} weak={weak} plan={plan} onChoose={setMap} onSave={onPlan}/>
  </>;
}
