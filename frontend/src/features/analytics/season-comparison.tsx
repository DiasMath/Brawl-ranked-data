import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { MapMixDiagnosis } from './evolution-diagnostics';
import { PagedTable } from '@/components/data-table';
import { Card } from '@/components/dashboard-ui';
import { byBrawlerName, ModeIcon, Portrait } from '@/components/game';
import { dateTime, modeName, normalize, number, percent } from '@/lib/data';
import type { RankedSeason } from '@/lib/data';
import {
  comparableSeasons, comparisonRows, difference, playerPick, seasonCohorts, seasonSummary,
} from '@/lib/season-comparison';
import type { SeasonDimension, SeasonExtent } from '@/lib/season-comparison';
import type { MatchSeries } from '@/lib/match-series';

const dimensions: [SeasonDimension, string][] = [
  ['brawler', 'Brawlers'], ['mode', 'Modos'], ['map', 'Mapas'], ['brawlerMode', 'Brawler por modo'],
];
const minimum = 10;

function Points({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  const points = Math.round(value * 1000) / 10 || 0;
  return <strong data-tone={points > 0 ? 'win' : points < 0 ? 'loss' : undefined}>
    {points > 0 ? '+' : ''}{number(points)} p.p.
  </strong>;
}

function WinRate({ row }: { row: { rate: number | null; wins: number; losses: number; games: number } }) {
  return <div className="season-rate">
    <strong>{percent(row.rate)}</strong>
    {row.rate !== null && <progress className="mode-rate" value={row.rate} max={1} aria-label="Win rate"/>}
    <small>{number(row.wins)} V · {number(row.losses)} D · {number(row.games)} {row.games === 1 ? 'série' : 'séries'}</small>
  </div>;
}

export function SeasonComparison({ matches, calendar, exportedAt, allowed, brawler,onOpen }: {
  matches: MatchSeries[]; calendar: RankedSeason[]; exportedAt: string;
  allowed: ReadonlySet<string>; brawler: string; onOpen:(id:string)=>void;
}) {
  const [selected, setSelected] = useState('');
  const [extent, setExtent] = useState<SeasonExtent>('elapsed');
  const [dimension, setDimension] = useState<SeasonDimension>('brawler');
  const [substantial, setSubstantial] = useState(false);
  const [order, setOrder] = useState<'games' | 'gain' | 'loss'>('games');
  const observedAt = Date.parse(exportedAt);
  const cohorts = useMemo(() => seasonCohorts(matches, calendar, observedAt), [matches, calendar, observedAt]);
  const preferred = cohorts.windows.some(item => item.id === selected) ? selected : '';
  const comparison = useMemo(() => comparableSeasons(cohorts, preferred, observedAt, extent, allowed),
    [cohorts, preferred, observedAt, extent, allowed]);
  const currentDesignation = cohorts.windows.at(-1)?.label;
  const pickDimension = dimension === 'brawler' || dimension === 'brawlerMode';

  if (!comparison) return <Card title="Comparar temporadas" icon={ArrowLeftRight}>
    <p className="section-note">{!calendar.length
      ? 'Aguardando o calendário de temporadas da coleta.'
      : 'A comparação fica disponível quando duas temporadas do calendário tiverem começado.'}</p>
  </Card>;

  const { current, previous, volume } = comparison;
  const scope = (entries: MatchSeries[]) => brawler ? entries.filter(match => normalize(playerPick(match)) === normalize(brawler)) : entries;
  const currentScoped = scope(current.matches), previousScoped = scope(previous.matches);
  const currentStats = seasonSummary(currentScoped), previousStats = seasonSummary(previousScoped);
  const rows = comparisonRows(pickDimension ? current.matches : currentScoped, pickDimension ? previous.matches : previousScoped, dimension)
    .filter(row => (!brawler || !pickDimension || normalize(row.brawler) === normalize(brawler))
      && (!substantial || Math.min(row.current.decided, row.previous.decided) >= minimum));
  if (order !== 'games') {
    const change = (row: typeof rows[number]) => Math.min(row.current.decided, row.previous.decided) >= minimum
      && row.winChange !== null ? row.winChange * (order === 'gain' ? -1 : 1) : Number.POSITIVE_INFINITY;
    rows.sort((a, b) => change(a) - change(b));
  }
  const winChange = difference(currentStats.rate, previousStats.rate);
  const volumeChange = currentStats.games && previousStats.games ? (currentStats.games - previousStats.games) / previousStats.games : null;
  const small = winChange !== null && Math.min(currentStats.decided, previousStats.decided) < minimum;
  const comebackChange = difference(currentStats.comebackRate, previousStats.comebackRate);

  return <Card title="Comparar temporadas" icon={ArrowLeftRight} className="season-comparison"
    sub={'Ranqueadas da conta · Recorte próprio de temporada e datas · '+(brawler || 'Todos os brawlers')}>
    <div className="mode-filters">
      <label>Temporada em análise<select value={preferred} onChange={event => setSelected(event.target.value)}>
        <option value="">Última iniciada · {currentDesignation}</option>
        {cohorts.windows.slice(1, -1).reverse().map(season => <option key={season.id} value={season.id}>{season.label}</option>)}
      </select></label>
      <label>Recorte<select value={extent} onChange={event => setExtent(event.target.value as SeasonExtent)}>
        <option value="elapsed">Mesmo tempo desde o início</option>
        <option value="volume">Mesmo número de séries registradas</option>
        <option value="all">Todo o histórico de cada temporada</option>
      </select></label>
      <label>Ordenação<select value={order} onChange={event => setOrder(event.target.value as typeof order)}>
        <option value="games">Mais séries</option>
        <option value="gain">Maiores altas de win rate</option>
        <option value="loss">Maiores quedas de win rate</option>
      </select></label>
    </div>
    <div className="season-comparison-summary">
      {([{ label: 'Em análise', side: current, summary: currentStats },
        { label: 'Anterior', side: previous, summary: previousStats }]).map(({ label, side, summary }) => <div key={label}>
        <small>{label}</small><h3>{side.window.label}</h3>
        {extent === 'elapsed' && <small>{dateTime(side.window.starts_at)} até {dateTime(new Date(side.end).toISOString())}</small>}
        <WinRate row={summary}/>
        <small>Primeira série registrada · {dateTime(side.firstRecorded)}</small>
        <small><a href={side.window.source_url} target="_blank" rel="noreferrer">
          {side.window.date_only ? 'Calendário estimado' : 'Calendário da temporada'}
        </a></small>
      </div>)}
      <div>
        <small>Diferença no win rate</small>
        <div className="season-comparison-value"><Points value={winChange}/></div>
        {small && <small>Amostra pequena · menos de {minimum} decisivas em um dos lados</small>}
        <small>Volume {volumeChange === null ? '—' : (volumeChange > 0 ? '+' : '') + percent(volumeChange)}</small>
        {(currentStats.comebackRate !== null || previousStats.comebackRate !== null) && <small>
          Viradas · {percent(currentStats.comebackRate)}{currentStats.lostOpening ? ` (${currentStats.comebacks}/${currentStats.lostOpening})` : ''} vs. {' '}
          {percent(previousStats.comebackRate)}{previousStats.lostOpening ? ` (${previousStats.comebacks}/${previousStats.lostOpening})` : ''} · <Points value={comebackChange}/>
        </small>}
      </div>
    </div>
    {extent === 'volume' && <p className="section-note">Primeiras {number(volume)} séries registradas de cada temporada, antes dos filtros de mapa, modo, rank e brawler.</p>}
    {extent === 'elapsed' && (!currentStats.games || !previousStats.games) && <p className="section-note">
      Falta histórico em um dos lados neste intervalo.{volume > 0 && <>
        {' '}<button type="button" className="text-button" onClick={() => setExtent('volume')}>
          Comparar {number(volume)} séries registradas de cada temporada
        </button>
      </>}
    </p>}
    <div className="season-comparison-controls">
      <div className="tabs" aria-label="Detalhar comparação">
        {dimensions.map(([value, label]) => <button type="button" key={value} aria-pressed={dimension === value}
          onClick={() => setDimension(value)}>{label}</button>)}
      </div>
      <label className="checkbox"><input type="checkbox" checked={substantial} onChange={event => setSubstantial(event.target.checked)}/>
        Só grupos com {minimum}+ decisivas de cada lado
      </label>
    </div>
    {rows.length ? <PagedTable label="Comparação entre temporadas" rows={rows} pageSize={8}
      pageKey={JSON.stringify([current.window.id, extent, dimension, substantial, brawler, order, rows.length])}
      className="season-comparison-table"
      headings={<><th>{dimensions.find(([id]) => id === dimension)?.[1]}</th><th>Em análise</th><th>Anterior</th>
        <th>Δ win rate</th>{pickDimension && <th>Pick rate · análise / anterior</th>}</>}
      renderRow={row => <tr key={row.id}>
        <td>
          {pickDimension && row.brawler && <span className="image-label"><Portrait name={row.brawler}/>
            {byBrawlerName.get(normalize(row.brawler))?.name ?? row.brawler}</span>}
          {(dimension === 'mode' || dimension === 'brawlerMode') && <span className="image-label"><ModeIcon mode={row.mode}/>
            {modeName(row.mode)}</span>}
          {dimension === 'map' && row.map}
        </td>
        <td><WinRate row={row.current}/></td><td><WinRate row={row.previous}/></td>
        <td><Points value={row.winChange}/>{row.winChange !== null &&
          Math.min(row.current.decided, row.previous.decided) < minimum && <small>Amostra pequena</small>}</td>
        {pickDimension && <td>{percent(row.currentPick)} / {percent(row.previousPick)}
          <small><Points value={difference(row.currentPick, row.previousPick)}/></small></td>}
      </tr>}/> : <p className="section-note">Nenhum grupo com histórico nos filtros selecionados.</p>}
    <p className="section-note">Win rate usa vitórias e derrotas por série. Pick rate usa séries com brawler identificado. A ordenação por variação prioriza grupos com 10 ou mais decisivas de cada lado.
      {cohorts.unassigned > 0 && ` ${number(cohorts.unassigned)} séries ficaram fora por falta de vínculo seguro com o calendário.`}
    </p>
    <MapMixDiagnosis key={JSON.stringify([current.window.id,extent,brawler])} current={currentScoped} previous={previousScoped} onOpen={onOpen}/>
  </Card>;
}
