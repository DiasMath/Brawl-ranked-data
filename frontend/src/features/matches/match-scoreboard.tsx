import { Ban, Star, Swords } from 'lucide-react';
import { Empty, Pill } from '@/components/dashboard-ui';
import { Portrait } from '@/components/game';
import { normalize, number, percent } from '@/lib/data';
import type { Battle, Participant, ParticipantStats } from '@/lib/data';
import { completedRankedSeries, hasOfficialBans, roundPlayerStats, seriesBans, seriesPlayers, sumRecorded } from '@/lib/match-series';
import type { MatchSeries } from '@/lib/match-series';

function teamsOf(players: Participant[]) {
  return [...new Set(players.map(player => player.team_index))].map(index => {
    const members = players.filter(player => player.team_index === index);
    const own = members.some(player => player.side === 'self');
    const opponent = members.every(player => player.side === 'opponent');
    return { index, members, own, label: own ? 'Sua equipe' : opponent ? 'Equipe adversária' : `Grupo ${index + 1}` };
  }).sort((a, b) => Number(b.own) - Number(a.own));
}

function RoundBans({ source, index }: { source: Battle; index?: number }) {
  const teams = teamsOf(source.players);
  const assigned = source.players.flatMap(player => player.banned_brawler ? [normalize(player.banned_brawler.name)] : []);
  const unassigned = (hasOfficialBans(source) ? source.bans : []).filter(name => !assigned.includes(normalize(name)));
  return <div className="match-round-bans">
    {(index !== undefined || !!assigned.length) && <p className="muted">{index !== undefined && `Lista da rodada ${index + 1}`}
      {index !== undefined && !!assigned.length && ' · '}
      {!!assigned.length && `${assigned.length} de ${source.players.length} jogadores com ban identificado`}</p>}
    {!!assigned.length && <div className="match-bans-teams">
      {teams.filter(team => team.members.some(player => player.banned_brawler)).map(team => <div key={team.index} className="match-ban-list">
        <h4>{team.label}</h4>
        <ul>{team.members.flatMap((player, i) => player.banned_brawler ? [
          <li key={i} className="image-label"><Portrait name={player.banned_brawler.name} id={player.banned_brawler.id}/>
            <div><strong>{player.banned_brawler.name}</strong><small>{player.player_name ?? player.player_tag ?? 'Jogador'}{player.side === 'self' && ' · Você'}</small></div>
          </li>,
        ] : [])}</ul>
      </div>)}
    </div>}
    {!!unassigned.length && <div className="match-ban-list"><h4>{assigned.length ? 'Outros bans da lista' : 'Bans registrados'}</h4>
      <ul>{unassigned.map((name, i) => <li key={i} className="image-label"><Portrait name={name}/>{name}</li>)}</ul>
    </div>}
    {!assigned.length && !unassigned.length && <p>Sem bans</p>}
  </div>;
}

function distinctBanRounds(rounds: Battle[]) {
  const seen = new Set<string>();
  return rounds.filter(round=>{
    const players = round.players.flatMap(player=>player.banned_brawler
      ? [JSON.stringify([player.player_tag,player.team_index,normalize(player.banned_brawler.name)])] : []);
    const names = hasOfficialBans(round) ? [...new Set(round.bans.map(normalize))].sort() : null;
    const key = JSON.stringify([players.sort(),names]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function MatchBans({ match, series, summary }: { match: Battle; series?: MatchSeries; summary?: boolean }) {
  const hasBans = (row: Battle) => hasOfficialBans(row) || row.players.some(player => player.banned_brawler);
  const consistent = series && seriesBans(series);
  const observed = series?.rounds.filter(hasBans) ?? [];
  const official = consistent && observed.filter(hasOfficialBans).reduce((best,round)=>
    round.players.filter(player=>player.banned_brawler).length > best.players.filter(player=>player.banned_brawler).length ? round : best,
  consistent);
  const rows = !summary && hasBans(match) ? [match] : official ? [official] : distinctBanRounds(observed);
  if (!rows.length) return null;

  return <section className="match-bans" aria-label="Bans da partida">
    <h3><Ban size={15}/> Bans da partida</h3>
    <p className="muted">Histórico da Supercell</p>
    {rows.map(source => <RoundBans key={source.id} source={source}
      index={series?.rounds.findIndex(round => round.id === source.id)}/>)}
  </section>;
}

type Metric = {
  id: string; label: string; additive: boolean; value: (stats?: ParticipantStats) => number | undefined;
};

const combatMetrics: Metric[] = [
  { id: 'damage_dealt', label: 'Dano causado', additive: true, value: stats => stats?.damage_dealt },
  { id: 'damage_taken', label: 'Dano recebido', additive: true, value: stats => stats?.damage_taken },
  { id: 'healing', label: 'Cura', additive: true, value: stats => stats?.healing },
];

function availableMetrics(rows: (ParticipantStats | undefined)[]) {
  const objectives = new Set(rows.flatMap(row => row?.objective ? [row.objective.type] : []));
  return [
    ...combatMetrics.filter(metric => rows.some(stats => metric.value(stats) !== undefined)),
    ...Array.from(objectives, (type):Metric => ({
      id: `objective:${type}`, label: type === 'safeDamage' ? 'Dano ao cofre' : `Objetivo (${type})`,
      additive: type === 'safeDamage', value: stats => stats?.objective?.type === type ? stats.objective.value : undefined,
    })),
  ];
}

function totalOf(rows: (ParticipantStats | undefined)[], value: Metric['value']) {
  return sumRecorded(rows.map(value));
}

const displayCount = (value: number | undefined) => value === undefined ? '—' : number(value);

export function MatchScoreboard({ match, series, isRound }: { match: Battle; series?: MatchSeries; isRound: boolean }) {
  const players = series ? seriesPlayers(series) : match.players.map(player=>({...player,stats:roundPlayerStats(match,player)}));
  const teams = teamsOf(players);
  if (!teams.length) return <Empty icon={Swords} title="Composição indisponível"/>;
  const stats = series ? series.rounds.flatMap(round=>round.players.map(player=>roundPlayerStats(round,player))) : players.map(player=>player.stats);
  const metrics = availableMetrics(stats).filter(metric=>!series || metric.additive);
  const hasKd = stats.some(row => row?.kills !== undefined || row?.deaths !== undefined);
  const hasStats = hasKd || metrics.length > 0;
  const title = series ? completedRankedSeries(series) ? 'Placar da série' : 'Placar das rodadas registradas'
    : isRound ? 'Placar da rodada' : 'Placar da partida';
  const starTag = series ? undefined : match.star_player?.tag;
  const ownTeam = teams.find(team => team.own)?.members ?? [];
  const player = ownTeam.find(member => member.side === 'self');
  const safeDamage = metrics.find(metric => metric.id === 'objective:safeDamage');
  const ownSafeDamage = safeDamage?.value(player?.stats);
  const teamSafeDamage = safeDamage && ownTeam.length === 3 ? totalOf(ownTeam.map(p => p.stats), safeDamage.value) : undefined;
  const share = ownSafeDamage !== undefined && teamSafeDamage ? ownSafeDamage / teamSafeDamage : null;

  return <section className="match-scoreboard" aria-label={title}>
    <div><h3>{hasStats ? title : 'Composição das equipes'}</h3>
      {hasStats && <p className="muted">{series ? `Soma de ${series.rounds.length} rodadas · — indica métrica incompleta` : 'Histórico da Supercell · — indica campo sem dado'}</p>}
    </div>
    {share !== null && <p className="match-objective-note"><strong>{percent(share)}</strong> do dano ao cofre da sua equipe
      <small> {displayCount(ownSafeDamage)} de {displayCount(teamSafeDamage)}</small></p>}
    {teams.map(team => {
      const rows = team.members.map(member => member.stats);
      const kills = totalOf(rows, stat => stat?.kills);
      const deaths = totalOf(rows, stat => stat?.deaths);
      const totals = metrics.map(metric => metric.additive ? totalOf(rows, metric.value) : undefined);
      const showTotals = team.members.length > 1 && (kills !== undefined || deaths !== undefined || totals.some(total => total !== undefined));
      return <section key={team.index} className="team">
        <h4>{team.label}</h4>
        <div className="table-wrap match-scoreboard-scroll" role="region" aria-label={`Placar · ${team.label}`} tabIndex={0}>
          <table aria-label={team.label}><thead><tr><th scope="col">Jogador</th>
            {hasKd && <th scope="col" title="Eliminações e mortes">K/D</th>}
            {metrics.map(metric => <th key={metric.id} scope="col">{metric.label}</th>)}
          </tr></thead><tbody>{team.members.map((member, index) => <tr key={index} data-self={member.side === 'self' || undefined}>
            <td><span className="image-label"><Portrait name={member.brawler} id={member.brawler_id}/><span>
              <strong title={member.player_tag ?? undefined}>{member.player_name ?? member.player_tag ?? 'Jogador'}</strong>
              <small>{[member.brawler, member.power != null && `Poder ${member.power}`].filter(Boolean).join(' · ') || '—'}</small></span>
              {member.side === 'self' && <Pill kind="accent">Você</Pill>}
              {member.player_tag && member.player_tag === starTag && <Star size={13} className="match-star" aria-label="Craque"/>}
            </span></td>
            {hasKd && <td>{displayCount(member.stats?.kills)} / {displayCount(member.stats?.deaths)}</td>}
            {metrics.map(metric => <td key={metric.id}>{displayCount(metric.value(member.stats))}</td>)}
          </tr>)}</tbody>
          {showTotals && <tfoot><tr><th scope="row">Total dos jogadores listados</th>
            {hasKd && <td>{displayCount(kills)} / {displayCount(deaths)}</td>}
            {metrics.map((metric, i) => <td key={metric.id}>{displayCount(totals[i])}</td>)}
          </tr></tfoot>}
          </table>
        </div>
      </section>;
    })}
  </section>;
}
