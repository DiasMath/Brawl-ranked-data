import { PagedTable } from '@/components/data-table';
import { Portrait } from '@/components/game';
import { number } from '@/lib/data';
import type { Dataset, Equipment } from '@/lib/data';

function itemList(items?: Equipment[]|null) {
  return items ? items.map(item=>item.name).join(', ') || 'Nenhum' : '—';
}

export function ProfileDetails({ profile }: { profile: NonNullable<Dataset['profile']> }) {
  const metrics=[
    ['Recorde de troféus',profile.highest_trophies],
    ['Nível de experiência',profile.exp_level],
    ['Vitórias 3×3',profile.victories_3v3],
    ['Vitórias solo',profile.solo_victories],
    ['Vitórias em dupla',profile.duo_victories],
  ] as const;
  const brawlers=profile.owned_brawlers??[];
  if(!brawlers.length&&!profile.club&&!metrics.some(([,value])=>value!=null))return null;
  return <details className="card profile-details">
    <summary>Perfil e coleção de brawlers</summary>
    <dl className="detail-grid">
      {metrics.flatMap(([label,value])=>value==null?[]:[<div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>])}
      {(profile.club?.name||profile.club?.tag)&&<div><dt>Clube</dt><dd>{profile.club.name??profile.club.tag}</dd></div>}
    </dl>
    {brawlers.length>0&&<PagedTable label="Coleção de brawlers" rows={brawlers} pageKey={profile.name} headings={<>
      <th>Brawler</th><th>Poder</th><th>Troféus</th><th>Recorde</th><th>Rank de troféus</th><th>Acessórios</th><th>Poderes de estrela</th><th>Engrenagens</th>
    </>} renderRow={b=><tr key={b.id??b.name}>
      <td><span className="image-label"><Portrait name={b.name} id={b.id}/>{b.name}</span></td>
      <td>{number(b.power)}</td><td>{b.trophies==null?'—':number(b.trophies)}</td>
      <td>{b.highest_trophies==null?'—':number(b.highest_trophies)}</td><td>{b.rank??'—'}</td>
      <td>{itemList(b.gadgets)}</td><td>{itemList(b.star_powers)}</td><td>{itemList(b.gears)}</td>
    </tr>}/>}
  </details>;
}
