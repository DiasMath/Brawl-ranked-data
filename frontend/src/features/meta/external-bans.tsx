import { useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { Card } from '@/components/dashboard-ui';
import { PagedTable } from '@/components/data-table';
import { Portrait } from '@/components/game';
import { dateTime, normalize, number, percent } from '@/lib/data';
import { draftMetaRanks } from '@/lib/draftmeta';
import type { DraftMetaRank } from '@/lib/draftmeta';
import { useExternalBans } from './use-external-bans';

export function ExternalBans({map,rank,patch}:{map:string;rank:DraftMetaRank;patch:string}) {
  const {snapshot,loading,error}=useExternalBans(map,rank,patch);
  const [search,setSearch]=useState('');
  const [order,setOrder]=useState<'ban_rate'|'pick_rate'|'games'|'win_rate'>('ban_rate');
  const rows=(snapshot?.rows??[]).filter(row=>normalize(row.name).includes(normalize(search)))
    .sort((a,b)=>(b[order]??-1)-(a[order]??-1)||b.games-a.games);
  return <Card title="Bans observados · DraftMeta" icon={Ban} sub={map||'Todos os mapas'}>
    {snapshot&&<>
      <p className="section-note">{draftMetaRanks[snapshot.rank]} pelo rank médio do lobby · {number(snapshot.drafts)} drafts ·
        {' '}{snapshot.start.split('-').reverse().join('/')} a {snapshot.end.split('-').reverse().join('/')} (UTC) ·
        {' '}{snapshot.rows.length} brawlers · Atualizado em {dateTime(snapshot.fetched_at)}{!snapshot.fresh?' · Cópia anterior':''}</p>
      <p className="section-note">Janela do provedor, que pode atravessar temporadas. Cobertura dos bans: {number(snapshot.drafts)} de {number(snapshot.battles)} partidas ({percent(snapshot.battles?snapshot.drafts/snapshot.battles:null)}).
        {' '}Cada brawler banido conta uma vez por draft, mesmo se os dois times o banirem. A população difere da tier list de Mestres+.</p>
      <div className="mode-filters"><label>Buscar brawler<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label>
        <label>Ordenar<select value={order} onChange={event=>setOrder(event.target.value as typeof order)}>
          <option value="ban_rate">Maior ban rate</option><option value="pick_rate">Maior presença</option>
          <option value="games">Mais partidas</option><option value="win_rate">Maior win rate</option>
        </select></label><a href={snapshot.source_url} target="_blank" rel="noreferrer">Dados e metodologia</a></div>
      <PagedTable label="Bans observados externos" rows={rows} pageKey={JSON.stringify([map,rank,patch,search,order])}
        headings={<><th>Brawler</th><th>Ban rate</th><th>Drafts com ban</th><th>Presença</th><th>Win rate da fonte</th><th>Partidas</th></>}
        renderRow={row=><tr key={row.name}><th scope="row"><span className="image-label"><Portrait name={row.name}/>{row.name}</span></th>
          <td>{percent(row.ban_rate)}</td><td>{number(row.banned)}</td><td>{percent(row.pick_rate)}</td>
          <td>{percent(row.win_rate)}<small>Bruto: {percent(row.raw_win_rate)}</small>{row.games<100&&<small>Amostra pequena</small>}</td><td>{number(row.games)}</td></tr>}/>
      <p className="section-note">Ban rate usa os drafts com bans conhecidos. Presença usa todas as partidas deste recorte. A recomendação de ban considera força e frequência quando o brawler está disponível; são indicadores diferentes.</p>
      <p className="section-note">Win rate da fonte é a taxa publicada. Bruto divide as vitórias pelas partidas informadas; as taxas podem diferir e são preservadas separadamente.</p>
    </>}
    {loading&&<p className="draft-recommendation-loading" role="status"><Loader2 size={16}/> Atualizando bans observados…</p>}
    {error&&<p className="section-note" role="status">{error}{snapshot?' Última cópia preservada.':''}</p>}
    {!loading&&!snapshot&&!error&&<p className="section-note">Sem bans publicados para este recorte.</p>}
  </Card>;
}
