import { ChartColumnIncreasing, Crosshair, Database, FlaskConical, LayoutDashboard, List, Target, TrendingUp } from 'lucide-react';

export const navigation = [
  { key: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { key: 'progress', label: 'Progressão', icon: TrendingUp },
  { key: 'matches', label: 'Partidas', icon: List },
  { key: 'performance', label: 'Desempenho', icon: ChartColumnIncreasing },
  { key: 'draftlab', label: 'Draft Lab', icon: FlaskConical },
  { key: 'draft', label: 'Picks, bans e counters', icon: Crosshair },
  { key: 'meta', label: 'Meta', icon: Target },
  { key: 'sources', label: 'Contas e dados', icon: Database },
] as const;
export type Section = typeof navigation[number]['key'];
export const subtitles: Record<Section, string> = {
  overview: 'Rank, forma recente e desempenho da sua conta.',
  progress: 'Troféus, pontos e plano para a próxima divisão.',
  matches: 'Consulte o histórico e abra o mapa, as equipes e os resultados.',
  performance: 'Encontre seus melhores e piores brawlers e mapas.',
  draftlab: 'Monte o draft e explore picks, bans e counters no recorte escolhido.',
  draft: 'Compare picks, bans e confrontos em um só lugar.',
  meta: 'Compare win rate, picks e bans por mapa com os dados da sua conta.',
  sources: 'Acompanhe a conta monitorada e as consultas do servidor.',
};
export const columnFilters = [
  ['map_name', 'Mapa', 'Todos os mapas'],
  ['player_brawler', 'Brawler', 'Todos os brawlers'], ['rank_label', 'Rank', 'Todos os ranks'],
  ['season', 'Temporada', 'Todas'],
] as const;
