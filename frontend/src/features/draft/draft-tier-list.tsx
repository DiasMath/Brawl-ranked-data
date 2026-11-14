import { Ban, Check, ChevronDown, Trophy } from 'lucide-react';
import { brawlers, Portrait } from '@/components/game';
import { normalize, number, percent } from '@/lib/data';
import { draftMetaPicks } from '@/lib/draftmeta';
import type { useDraftMeta } from './use-draftmeta';

export function DraftTierList({ meta, compact = false, banned, picked, onPick, disabled }: {
  meta: ReturnType<typeof useDraftMeta>; compact?: boolean; banned?: Set<string>; picked?: Set<string>;
  onPick?: (name: string)=>void; disabled?: (name: string)=>boolean;
}) {
  const snapshot = meta.snapshot ?? meta.general;
  const ranked = draftMetaPicks(snapshot);
  const known = new Map(ranked.map(row=>[normalize(row.name),row]));
  const roster = new Set(brawlers.map(brawler=>normalize(brawler.name)));
  const rows = brawlers.map(brawler=>({brawler, stats:known.get(normalize(brawler.name))}));
  const missing = ranked.filter(row=>!roster.has(normalize(row.name)));
  const entries = [...rows, ...missing.map(row=>({brawler:{name:row.name,id:undefined},stats:row}))];
  const body = <>
    <p className="tier-scope">{snapshot ? <>
      {snapshot.map ?? 'Todos os mapas'} · Patch {snapshot.patch_date.split('-').reverse().join('/')}
      {meta.sourceMap && !meta.snapshot && (meta.loading?' · Consultando o mapa':' · Classificação geral')}
      {' · '}<a href={snapshot.source_url} target="_blank" rel="noreferrer">DraftMeta</a>
    </> : meta.loading?'Carregando a classificação…': 'Sem classificação salva para o recorte.'}</p>
    {['S','A','B','C','D',null].map(tier=>{
      const members=entries.filter(entry=>(entry.stats?.tier??null)===tier)
        .sort((a,b)=>(b.stats?.winRate??0)-(a.stats?.winRate??0));
      if(!members.length)return null;
      return <div className="tier-row" key={tier??'unrated'}>
        <strong className={`tier-letter tier-${tier??'unrated'}`} title={tier?`Tier ${tier}`:'Sem classificação'}>{tier??'—'}</strong>
        <ul aria-label={tier?`Tier ${tier}`:'Sem classificação'}>{members.map(({brawler,stats})=>{
          const key=normalize(brawler.name);
          const status=banned?.has(key)?'Banido':picked?.has(key)?'Escolhido':null;
          const label=[brawler.name,status,stats?`${percent(stats.winRate)} de vitória · ${number(stats.games)} partidas`:'Sem classificação'].filter(Boolean).join(' · ');
          const content=<><Portrait id={brawler.id} name={brawler.name}/><span>{brawler.name}</span>
            {status==='Banido'?<Ban size={13}/>:status==='Escolhido'?<Check size={13}/>:null}</>;
          return <li key={key} data-status={status??undefined} title={label}>{onPick?
            <button type="button" aria-label={label} disabled={disabled?.(brawler.name)||!brawler.id} onClick={()=>onPick(brawler.name)}>{content}</button>:
            <span className="tier-member">{content}</span>}</li>;
        })}</ul>
      </div>;
    })}
  </>;
  return compact ? <details className="draft-tier-list" open>
    <summary><Trophy size={14}/> Tier list <small>{snapshot?.map ?? 'Geral'}</small><ChevronDown size={14}/></summary>
    <div className="draft-tier-rows" tabIndex={0} aria-label="Classificação dos brawlers">{body}</div>
  </details> : <section className="card meta-tier-list draft-tier-expanded">
    <div className="card-head"><div><h2><Trophy size={16}/> Tier list</h2></div></div>{body}
  </section>;
}
