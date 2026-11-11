import { Target } from 'lucide-react';
import { Card, Empty, Pill } from '@/components/dashboard-ui';
import { comparable, metaFor, modeName, number, percent, safeLink, stats } from '@/lib/data';
import type { Dataset, Filters } from '@/lib/data';

export function MetaView({ data, filters }: { data: Dataset; filters: Filters }) {
  const rows = metaFor(data.meta, filters);
  return <Card title="Sua conta × meta" icon={Target} sub="Win rate calculado sobre vitórias e derrotas no período e recorte de cada fonte.">
    {rows.length ? <div className="table-wrap"><table><thead><tr><th>Brawler / recorte</th><th>Sua taxa / n</th><th>Meta / n</th><th>Diferença</th>
      <th>Pick / ban da meta</th><th>Fonte</th></tr></thead><tbody>{rows.map(row => {
      const s = stats(comparable(data.matches, row)); const rate = row.wins / row.games;
      const delta = s.rate === null ? null : (s.rate - rate) * 100;
      return <tr key={row.id}><td><strong>{row.brawler}</strong><small>{[row.map_name, row.mode && modeName(row.mode), row.rank_label, row.season].filter(Boolean).join(' · ') || 'Geral'}</small></td>
        <td>{percent(s.rate)} / {number(s.decided)}</td><td>{percent(rate)} / {number(row.games)}</td>
        <td>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`}</td>
        <td>{percent(row.pick_total ? row.pick_count! / row.pick_total : null)} / {percent(row.ban_total ? row.ban_count! / row.ban_total : null)}</td>
        <td><a href={safeLink(row.source_url)} target="_blank" rel="noreferrer">{row.source_name}</a><small>{row.period_start} → {row.period_end}</small></td></tr>;
    })}</tbody></table></div> : <Empty icon={Target} title="Meta indisponível neste recorte">As observações externas aparecem quando estiverem disponíveis neste recorte.</Empty>}
    {rows.length > 0 && <p className="section-note"><Pill kind="accent">Hipótese</Pill> Diferenças observadas podem refletir amostra, estratégia ou seleção da fonte. A comparação é descritiva.</p>}
  </Card>;
}
