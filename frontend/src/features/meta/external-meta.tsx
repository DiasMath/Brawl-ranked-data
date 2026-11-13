import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { findMap, MapImage, maps, pickableModes, Portrait } from '@/components/game';
import { dateTime, number, percent } from '@/lib/data';
import type { Battle } from '@/lib/data';
import { accountInExternalScope } from '@/lib/external-comparison';
import { AccountBans, AccountComparison } from './external-account';
import type { BrawlerStats } from './external-account';
import { collectionRequest } from '@/lib/live';

type Movement = { name: string; win_change: number; pick_change: number; games: number };
type Window = { start: string; end: string; battles: number };
type Snapshot = Window & {
  provider: string; patch_date: string; map: string | null; source_url: string; fetched_at: string; fresh: boolean;
  tiers: { tier: string; brawlers: BrawlerStats[] }[];
  map_picks: { name: string; pick_rate: number }[];
  presence?: { name: string; pick_rate: number }[] | null;
  movements: {
    previous: Window; source_url: string; win_risers: Movement[]; win_fallers: Movement[];
    pick_risers: Movement[]; pick_fallers: Movement[];
  } | null;
};

const mapOptions = [...new Set(maps.filter(m => !m.disabled && pickableModes.some(mode => mode.id === m.mode))
  .map(m => m.name))].sort((a,b) => a.localeCompare(b));
const dateLabel = (day: string) => day.split('-').reverse().join('/');
const points = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR')} p.p.`;

function Changes({ data }: { data: NonNullable<Snapshot['movements']> }) {
  const groups = [
    {title:'Win rate em alta', rows:data.win_risers, key:'win_change', icon:TrendingUp},
    {title:'Win rate em queda', rows:data.win_fallers, key:'win_change', icon:TrendingDown},
    {title:'Presença em alta', rows:data.pick_risers, key:'pick_change', icon:TrendingUp},
    {title:'Presença em queda', rows:data.pick_fallers, key:'pick_change', icon:TrendingDown},
  ] as const;
  return <section className="card external-meta-card">
    <div className="card-head"><div><h2>Mudanças após o patch</h2>
      <p>Contra {dateLabel(data.previous.start)} a {dateLabel(data.previous.end)} · {number(data.previous.battles)} partidas</p></div>
      <a href={data.source_url} target="_blank" rel="noreferrer">Metodologia e dados</a></div>
    <div className="meta-movements">{groups.map(({title, rows, key, icon:Icon})=><div key={title}>
      <h3><Icon size={14}/> {title}</h3><ul>{rows.map(row=><li key={row.name}>
        <Portrait name={row.name}/><span>{row.name}</span><strong>{points(row[key])}</strong>
      </li>)}</ul>
    </div>)}</div>
  </section>;
}

export function ExternalMeta({matches,accountName}: {matches:Battle[]; accountName:string}) {
  const [map,setMap] = useState('');
  const [patch,setPatch] = useState('');
  const [patches,setPatches] = useState<string[]>([]);
  const [snapshot,setSnapshot] = useState<Snapshot|null>(null);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [message,setMessage] = useState('');
  useEffect(()=>{
    const controller = new AbortController();
    setLoading(true);
    setSnapshot(null);
    setMessage('');
    const params=new URLSearchParams({map});
    if(patch) params.set('patch',patch);
    void collectionRequest<{snapshot:Snapshot|null;patches:string[]}>(`/api/meta/external?${params}`, {signal:controller.signal})
      .then(data=>{
        if(controller.signal.aborted) return;
        setSnapshot(data.snapshot);
        setPatches(data.patches??[]);
      })
      .catch(error=>{if(!controller.signal.aborted) setMessage(error.message);})
      .finally(()=>{if(!controller.signal.aborted) setLoading(false);});
    return ()=>controller.abort();
  },[map,patch]);
  async function refresh() {
    setRefreshing(true);
    setMessage('');
    try {
      const result=await collectionRequest<{snapshot:Snapshot;cached:boolean;patches:string[]}>('/api/meta/external', {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({map}),
      });
      setSnapshot(result.snapshot);
      setPatches(result.patches??[]);
      if(result.cached) setMessage('A consulta salva tem menos de uma hora.');
    } catch(error) {
      setMessage(error instanceof Error?error.message:'Falha ao atualizar o DraftMeta.');
    } finally {setRefreshing(false);}
  }
  const current = (snapshot?.map ?? '') === map && (!patch||snapshot?.patch_date===patch) ? snapshot : null;
  const accountMatches=useMemo(()=>current?accountInExternalScope(matches,current):[],[matches,current]);
  const pickRates = new Map((current?.presence??current?.map_picks)?.map(row=>[row.name,row.pick_rate]));
  return <div className="stack">
    <section className="card account-card external-meta-card">
      <div className="card-head"><div><h2><Trophy size={17}/> Meta competitiva · DraftMeta</h2>
        <p>Ranqueado com draft · Todos os ranks · Tier list publicada pela fonte</p></div>
        <a href={current?.source_url ?? 'https://draftmeta.com/games/brawl-stars/tier-list'} target="_blank" rel="noreferrer">Ver no DraftMeta</a></div>
      <div className="form-grid tracked-account-form">
        <label>Mapa<select value={map} disabled={refreshing} onChange={event=>{setMap(event.target.value);setPatch('');setPatches([]);}}>
          <option value="">Todos os mapas</option>{mapOptions.map(name=><option key={name}>{name}</option>)}</select></label>
        <label>Patch<select value={patch} disabled={refreshing} onChange={event=>setPatch(event.target.value)}>
          <option value="">Último salvo</option>{patches.map(day=><option value={day} key={day}>{dateLabel(day)}</option>)}
        </select></label>
        <button className="button primary" onClick={()=>void refresh()} disabled={loading||refreshing||!!patch} aria-busy={refreshing}>
          <RefreshCw size={15}/> {refreshing?'Consultando…':'Atualizar do DraftMeta'}
        </button>
      </div>
      {map&&<MapImage map={findMap(map)} className="external-map-preview"/>}
      {message&&<p className="section-note" role="status">{message}</p>}
      {current?<p className="section-note">Patch de {dateLabel(current.patch_date)} · {dateLabel(current.start)} a {dateLabel(current.end)} · {number(current.battles)} partidas · Consultado em {dateTime(current.fetched_at)}{!current.fresh?' · Última cópia salva':''}</p>:
        <p className="section-note">{loading?'Carregando cópia salva…':'Sem consulta salva para este recorte. Atualize para carregar os indicadores.'}</p>}
    </section>
    {current&&<AccountComparison matches={accountMatches} accountName={accountName}
      tiers={current.tiers} pickRates={pickRates} sourceUrl={current.source_url}/>}
    {current&&<section className="card meta-tier-list">
      <div className="card-head"><div><h2>Tier list {current.map?`· ${current.map}`:''}</h2>
        <p>Win rate e amostra por brawler. Presença é a porcentagem de partidas com o brawler.{current.presence?' Calculada com as contagens publicadas, após conferir as seis escolhas por partida.':' A taxa aparece onde a fonte disponibiliza dados compatíveis.'}</p></div></div>
      {current.tiers.map(tier=><div key={tier.tier} className="tier-row">
        <strong className={`tier-letter tier-${tier.tier}`}>{tier.tier}</strong>
        <ul>{tier.brawlers.map(row=><li key={row.name}><Portrait name={row.name}/><div><strong>{row.name}</strong>
          <small>{percent(row.win_rate/100)} vitórias · {number(row.games)}</small>
          {pickRates.has(row.name)&&<small>{percent(pickRates.get(row.name)!/100)} presença</small>}</div></li>)}</ul>
      </div>)}
    </section>}
    {current?.movements&&<Changes data={current.movements}/>}
    {current&&<AccountBans key={`${current.patch_date}:${current.map??'all'}`} matches={accountMatches} selectedMap={current.map}/>}
  </div>;
}
