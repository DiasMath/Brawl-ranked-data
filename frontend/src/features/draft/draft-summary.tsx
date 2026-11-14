import { useEffect, useRef, useState } from 'react';
import { Crosshair, Settings2, Shield, Star, Swords, X } from 'lucide-react';
import { MapImage, ModeIcon, Portrait } from '@/components/game';
import type { GameMap } from '@/components/game';
import { dateTime, modeName, normalize, number, percent } from '@/lib/data';
import type { Dataset } from '@/lib/data';
import { draftMatchups, draftModel, draftProbability, highlightMatchups, modeTips } from '@/lib/draft-analysis';
import { draftEquipment } from '@/lib/draft-equipment';
import { usePublicStats } from '@/lib/scouting';
import type { PublicIndex, PublicStats } from '@/lib/scouting';

const categories = [
  {key:'gadgets', label:'Acessórios', folder:'gadgets', Icon:Settings2},
  {key:'starPowers', label:'Poderes de estrela', folder:'star-powers', Icon:Star},
  {key:'gears', label:'Engrenagens', folder:'gears', Icon:Shield},
] as const;

function MatchupList({title, rows, unit}: {title:string; rows:ReturnType<typeof draftMatchups>; unit:string}) {
  return <div className="draft-matchup-list"><h4>{title}</h4>
    {rows.length ? rows.map(row=><div className="draft-matchup-row" key={row.blue+'|'+row.red}>
      <span><Portrait name={row.blue}/>{row.blue}</span><span className="muted">vs.</span><span><Portrait name={row.red}/>{row.red}</span>
      <span><strong>{percent(row.wins/row.games)}</strong><small>{number(row.games)} {unit}</small></span>
    </div>) : <p className="muted">Sem confrontos com amostra suficiente.</p>}
  </div>;
}

export function DraftSummary({map,mapName,mode,team,enemy,sample,index,profile,onClose}:{
  map?:GameMap; mapName:string; mode:string|null; team:string[]; enemy:string[]; sample:PublicStats|null;
  index:PublicIndex|null; profile:Dataset['profile']; onClose:()=>void;
}) {
  const ref=useRef<HTMLDialogElement>(null);
  const [selected,setSelected]=useState(team[0]);
  const [detail,setDetail]=useState<string|null>(null);
  const [missingIcons,setMissingIcons]=useState<number[]>([]);
  const historical=usePublicStats(mode,mapName||null,undefined,'reference');
  const currentRows=mapName?draftMatchups(sample,team,enemy):[];
  const historicalRows=mapName?draftMatchups(historical.sample,team,enemy):[];
  const usesCurrent=currentRows.length>0;
  const pairs=highlightMatchups(usesCurrent?currentRows:historicalRows);
  const matchupSource=usesCurrent?index:historical.index;
  const unit=matchupSource?.unit??'séries';
  const guess=draftProbability(mapName,mode,team,enemy);
  const name=team.includes(selected)?selected:team[0];
  const owned=profile?.owned_brawlers?.find(b=>normalize(b.name)===normalize(name));
  const items=draftEquipment(name,mode,enemy,owned);
  useEffect(()=>{
    const element=ref.current;
    element?.showModal();
    return ()=>element?.close();
  },[]);

  return <dialog ref={ref} className="draft-summary" aria-labelledby="draft-summary-title"
    onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="draft-summary-body">
      <header className="drawer-head"><div>
        <h2 id="draft-summary-title">Análise do draft</h2>
        <p className="image-label"><ModeIcon mode={mode}/>{mapName||'Mapa a definir'}{mode&&' · '+modeName(mode)}</p>
      </div><button className="icon-button" aria-label="Fechar análise do draft" onClick={onClose}><X size={21}/></button></header>
      <section className="draft-outlook" aria-label="Chance estimada de vitória">
        <MapImage map={map}/>
        <div>
          <h3>Chance estimada de vitória</h3>
          {guess?<><div className="draft-odds">
            <span>Azul <strong>{percent(guess.blue)}</strong></span><span>Vermelho <strong>{percent(1-guess.blue)}</strong></span>
          </div><div className="draft-odds-bar" aria-hidden="true"><span style={{width:`${guess.blue * 100}%`}}/></div>
          <p className="muted">Modelo histórico · treino em {draftModel.trained.split('-').reverse().join('/')} · {number(guess.series)} séries no mapa.
            {' '}Amostra anterior ao balanceamento de 11/11. <a href={draftModel.source} target="_blank" rel="noreferrer">Fonte</a></p></>:
            <p className="muted">{mapName?'Sem amostra histórica suficiente para esta composição no mapa.':'Escolha um mapa para estimar a chance de vitória.'}</p>}
        </div>
      </section>
      <section className="draft-summary-section">
        <h3><Crosshair size={16}/> Confrontos no mapa</h3>
        <div className="draft-matchup-columns">
          <MatchupList title="Favoráveis ao azul" rows={pairs.best} unit={unit}/>
          <MatchupList title="Atenção no azul" rows={pairs.worst} unit={unit}/>
        </div>
        {matchupSource&&(pairs.best.length>0||pairs.worst.length>0)&&<p className="muted">Win rate observado de equipes com os dois brawlers em lados opostos · {matchupSource.start} a {matchupSource.end}.
          {' '}<a href={matchupSource.url} target="_blank" rel="noreferrer">{matchupSource.source}</a></p>}
      </section>
      <section className="draft-summary-section">
        <h3><Swords size={16}/> Dicas para a partida</h3>
        {mode&&modeTips[mode]&&<p>{modeTips[mode]}</p>}
        {pairs.worst[0]&&<p>Se {pairs.worst[0].red} pressionar {pairs.worst[0].blue}, teste a troca de rota com um aliado.</p>}
        {pairs.best[0]&&<p>Teste {pairs.best[0].blue} contra {pairs.best[0].red} na abertura e ajuste pela posição adversária.</p>}
        {!mode&&!pairs.worst.length&&!pairs.best.length&&<p className="muted">Selecione um mapa para ver sugestões de abertura.</p>}
      </section>
      <section className="draft-summary-section">
        <h3><Settings2 size={16}/> Sugestões de equipamento</h3>
        <p className="muted">Equipe os itens marcados com ✓. {owned&&'Itens desbloqueados têm prioridade. '}{profile?.fetched_at&&owned&&'Perfil lido em '+dateTime(profile.fetched_at)+'.'}
          {' '}<a href="https://brawlapi.com/new" target="_blank" rel="noreferrer">Catálogo BrawlAPI</a></p>
        <div className="draft-build-choices" aria-label="Brawler da equipe azul">
          {team.map(brawler=><button type="button" className="button small subtle" key={brawler} aria-pressed={name===brawler}
            onClick={()=>{setSelected(brawler);setDetail(null);}}><Portrait name={brawler}/>{brawler}</button>)}
        </div>
        <div className="draft-build-grid">{categories.map(({key,label,folder,Icon})=><div key={key}>
          <h4>{label}</h4>
          <div className="draft-build-items">{items[key].map((item,i)=>{
            const recommended=i<(key==='gears'?2:1)&&item.unlocked!==false;
            return <button type="button" key={item.name} data-recommended={recommended}
            aria-label={`${label} · ${item.name}${recommended?' · Equipar':item.unlocked===false?' · Bloqueado':' · Alternativa'}`}
            aria-pressed={detail===item.name} title={item.name}
            onClick={()=>setDetail(detail===item.name?null:item.name)}>
            {item.id!==null&&!missingIcons.includes(item.id)?<img alt="" src={`https://cdn.brawlify.com/${folder}/regular/${item.id}.png`}
              referrerPolicy="no-referrer" onError={()=>{const id=item.id;if(id!==null)setMissingIcons(list=>[...list,id]);}}/>:<Icon size={21}/>}
            <span className="build-item-order">{recommended?'✓':i+1}</span>
            <strong>{item.name}</strong><small>{recommended?'Equipar':item.unlocked===false?'Bloqueado':'Alternativa'}</small>
          </button>})}</div>
          {!items[key].length&&<p className="muted">Sem itens no catálogo.</p>}
        </div>)}</div>
        {Object.values(items).flat().filter(item=>item.name===detail).map(item=><p className="draft-build-detail" key={item.name}>
          <strong>{item.name}</strong>{item.reason&&<span>{item.reason}</span>}
          {item.unlocked!==undefined&&<small>{item.unlocked?'Desbloqueado na conta':'Fora do inventário da conta'}</small>}
          {item.description!==item.reason&&<small lang="en">{item.description}</small>}
        </p>)}
      </section>
    </div>
  </dialog>;
}
