import { useMemo, useState } from 'react';
import { Ban, ChartNoAxesCombined } from 'lucide-react';
import { Portrait } from '@/components/game';
import { normalize, number, percent } from '@/lib/data';
import type { Battle } from '@/lib/data';
import { accountBrawlerRows, mapKey, observedBans } from '@/lib/external-comparison';

import type { DraftMetaBrawler as BrawlerStats } from '@/lib/draftmeta';
const MIN_DELTA_GAMES = 10;
const deltaText = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('pt-BR', {maximumFractionDigits:1})} p.p.`;
};

export function AccountComparison({ matches, accountName, tiers, pickRates, sourceUrl }: {
  matches: Battle[]; accountName: string; tiers: {tier:string; brawlers:BrawlerStats[]}[];
  pickRates: Map<string,number>; sourceUrl: string;
}) {
  const [query,setQuery] = useState('');
  const [ownOnly,setOwnOnly] = useState(true);
  const [sort,setSort] = useState<'volume'|'win'|'delta'>('volume');
  const mine = useMemo(()=>accountBrawlerRows(matches),[matches]);
  const external = new Map(tiers.flatMap(tier=>tier.brawlers.map(brawler=>
    [normalize(brawler.name),{...brawler,tier:tier.tier}] as const)));
  const keys = [...new Set([...external.keys(),...mine.keys()])];
  const rows = keys.flatMap(key=>{
    const own=mine.get(key);
    const benchmark=external.get(key);
    const name=benchmark?.name??own?.label??key;
    if ((ownOnly && !own) || !normalize(name).includes(normalize(query))) return [];
    const delta=own && own.rate!==null && own.decided>=MIN_DELTA_GAMES && benchmark ? own.rate*100-benchmark.win_rate : null;
    return [{name,own,benchmark,delta}];
  }).sort((a,b)=>{
    const volume=(b.own?.decided??0)-(a.own?.decided??0);
    const order=sort==='delta'?(b.delta??-101)-(a.delta??-101):
      sort==='win'?(b.benchmark?.win_rate??-1)-(a.benchmark?.win_rate??-1):volume;
    return order||volume||a.name.localeCompare(b.name,'pt-BR');
  });
  return <section className="card account-card external-meta-card">
    <div className="card-head"><div><h2><ChartNoAxesCombined size={17}/> {accountName} × DraftMeta</h2>
      <p>Mesmo mapa e janela do snapshot · {number(matches.length)} ranqueadas da sua conta no recorte</p></div>
      <a href={sourceUrl} target="_blank" rel="noreferrer">Fonte dos indicadores competitivos</a></div>
    <p className="section-note">As datas da fonte são tratadas em UTC, até o horário da consulta. A conta usa vitórias sobre vitórias e derrotas. O DraftMeta mede ranqueadas com draft de todos os ranks. A diferença é descritiva e aparece a partir de {MIN_DELTA_GAMES} partidas decisivas da conta.</p>
    <div className="counter-controls">
      <label>Brawler<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar brawler"/></label>
      <label>Ordenar<select value={sort} onChange={event=>setSort(event.target.value as typeof sort)}>
        <option value="volume">Mais jogados na conta</option><option value="win">Maior win rate da fonte</option><option value="delta">Maior diferença</option>
      </select></label>
      <label className="checkbox"><input type="checkbox" checked={ownOnly} onChange={event=>setOwnOnly(event.target.checked)}/> Só brawlers que joguei</label>
    </div>
    {rows.length?<div className="table-wrap"><table><thead><tr>
      <th>Brawler</th><th>Tier</th><th>Meu win rate</th><th>DraftMeta</th><th>Diferença</th><th>Presença na fonte</th>
    </tr></thead><tbody>{rows.map(({name,own,benchmark,delta})=><tr key={name}>
      <td><span className="image-label"><Portrait name={name}/>{name}</span></td>
      <td>{benchmark?.tier??'—'}</td>
      <td>{percent(own?.rate??null)}{own&&<small>{number(own.wins)} V · {number(own.losses)} D{own.draws?` · ${number(own.draws)} E`:''}{own.decided>0&&own.decided<MIN_DELTA_GAMES?' · amostra pequena':''}</small>}</td>
      <td>{percent(benchmark?benchmark.win_rate/100:null)}{benchmark&&<small>{number(benchmark.games)} na amostra</small>}</td>
      <td>{delta===null?'—':deltaText(delta)}</td>
      <td>{percent(pickRates.has(name)?pickRates.get(name)!/100:null)}</td>
    </tr>)}</tbody></table></div>:<p className="section-note">{matches.length?'Nenhum brawler corresponde aos filtros.':'Nenhuma ranqueada da conta neste recorte. Desmarque “Só brawlers que joguei” para consultar a referência.'}</p>}
  </section>;
}

export function AccountBans({matches,selectedMap}: {matches:Battle[]; selectedMap:string|null}) {
  const [map,setMap] = useState('');
  const available=matches.filter(match=>match.bans!==null&&!match.bans_source);
  if(!available.length)return null;
  const maps = [...new Map(available.flatMap(match=>match.map_name?[[mapKey(match.map_name),match.map_name] as const]:[]))]
    .sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
  const activeMap = selectedMap ? mapKey(selectedMap) : maps.some(([key])=>key===map) ? map : '';
  const result = observedBans(activeMap ? matches.filter(match=>mapKey(match.map_name)===activeMap) : matches);
  if(!result.known)return null;
  return <section className="card account-card external-meta-card">
    <div className="card-head"><div><h2><Ban size={17}/> Bans observados nas minhas partidas</h2>
      <p>{number(result.known)} de {number(result.total)} partidas com lista conhecida{result.total?` · ${percent(result.known/result.total)} de cobertura`:''}</p></div>
      <a href="https://draftmeta.com/games/brawl-stars/ranked/bans" target="_blank" rel="noreferrer">Ver bans competitivos no DraftMeta</a></div>
    {!selectedMap&&maps.length>0&&<div className="counter-controls"><label>Mapa dos bans<select value={activeMap} onChange={event=>setMap(event.target.value)}>
      <option value="">Todos os mapas</option>{maps.map(([key,name])=><option value={key} key={key}>{name}</option>)}
    </select></label></div>}
    <p className="section-note">Taxa nas partidas da sua conta com lista publicada pela Supercell. Um brawler conta uma vez por partida.</p>
    {result.rows.length?<div className="table-wrap"><table><thead><tr><th>Brawler</th><th>Partidas em que foi banido</th><th>Taxa observada</th></tr></thead>
      <tbody>{result.rows.map(row=><tr key={row.label}><td><span className="image-label"><Portrait name={row.label}/>{row.label}</span></td>
        <td>{number(row.bans)} de {number(result.known)}</td><td>{percent(row.bans/result.known)}</td></tr>)}</tbody></table></div>:
      <p className="section-note">As listas recebidas registram zero bans.</p>}
  </section>;
}
