import { byBrawlerName } from '@/components/game';
import probability from '@/lib/catalog/draft-probability.json';
import { normalize } from '@/lib/data';
import { draftMetaMapKey } from '@/lib/draftmeta';
import { ordered } from '@/lib/scouting';
import type { PublicStats } from '@/lib/scouting';

const positions = new Map(probability.ids.map((id, index) => [id, index]));
const brawlerId = (name: string) => byBrawlerName.get(normalize(name))?.id;

export const draftModel = {
  source: probability.source, trained: probability.trained, validated: probability.validated,
  validationSeries: probability.validation_series, brier: probability.brier,
};

export function draftProbability(map: string, mode: string | null, team: string[], enemy: string[]) {
  if (team.length !== 3 || enemy.length !== 3 || new Set([...team, ...enemy].map(normalize)).size !== 6) return null;
  const scope = probability.maps.find(row => draftMetaMapKey(row.map) === draftMetaMapKey(map) && (!mode || row.mode === mode));
  if (!scope) return null;
  const scores = [...team, ...enemy].map(name => scope.scores[positions.get(brawlerId(name) ?? -1) ?? -1]);
  if (scores.some(score => score == null)) return null;
  const logOdds = scores.reduce<number>((total, score, index) => total + (index < 3 ? 1 : -1) * (score ?? 0), 0) / 1000;
  return { blue: 1 / (1 + Math.exp(-logOdds)), series: scope.series };
}

export function draftMatchups(sample: PublicStats | null, team: string[], enemy: string[]) {
  const allies = new Map(team.map(name => [brawlerId(name), name]));
  const opponents = new Map(enemy.map(name => [brawlerId(name), name]));
  return sample?.pairs.flatMap(([ally, opponent, wins, games]) => {
    const blue = allies.get(ally), red = opponents.get(opponent);
    return blue && red && games >= 30 && wins >= 0 && wins <= games ? [{blue,red,wins,games}] : [];
  }) ?? [];
}

export function highlightMatchups(rows: ReturnType<typeof draftMatchups>) {
  return {
    best: ordered(rows.filter(row => row.wins > row.games / 2)).slice(0, 2),
    worst: ordered(rows.filter(row => row.wins < row.games / 2), true).slice(0, 2),
  };
}

export const modeTips: Record<string, string> = {
  gemGrab: 'Combine quem vai carregar as gemas. Com a contagem regressiva a favor, cubra a retirada do portador.',
  brawlBall: 'Mantenha cobertura atrás da bola. Quando ganhar uma eliminação, use a vantagem para avançar junto.',
  heist: 'Combine quem defende e quem pressiona o cofre. Compare o dano esperado antes de aceitar uma troca de cofres.',
  knockout: 'Guarde munição para a aproximação final. Depois de uma eliminação, feche ângulos junto com os aliados.',
  bounty: 'Com a liderança, recue junto e preserve o desempate. Antes de arriscar, confira quantas estrelas você entrega.',
  hotZone: 'Combine quem fica no ponto e quem cobre a entrada. Alterne a presença na zona quando precisar recuperar vida.',
  wipeout: 'Depois de uma eliminação, ocupe espaço com a equipe. Com a liderança, evite lutar sozinho longe da cobertura.',
};
