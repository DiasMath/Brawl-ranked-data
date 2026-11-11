export type Participant = {
  team_index: number; player_tag: string | null; player_name: string | null;
  brawler: string | null; brawler_id?: number | null; power: number | null; side: 'self' | 'ally' | 'opponent' | 'unknown';
};
export type Battle = {
  id: string; played_at: string; event_id?: number | null; trophy_change?: number | null; first_seen_at?: string | null; delay_observed?: boolean; map_name: string | null; mode: string | null; api_type: string | null;
  ranked: boolean; result: 'victory' | 'defeat' | 'draw' | null; duration_seconds: number | null;
  player_brawler: string | null; rank_label: string | null; rank_score: number | null; season: string | null;
  bans: string[] | null; players: Participant[];
  rank_reference: string | null; score_reference: string | null; season_reference: string | null; bans_reference: string | null;
  rank_source: string | null; score_source: string | null; season_source: string | null; bans_source: string | null;
};
export type Update = {
  id: number; started_at: string; finished_at: string | null; status: 'success' | 'error' | 'running';
  received: number | null; added: number | null; message: string | null;
};
export type Meta = {
  id: number; source_name: string; source_url: string; period_start: string; period_end: string;
  map_name: string | null; mode: string | null; rank_label: string | null; season: string | null;
  brawler: string; wins: number; games: number; pick_count: number | null; pick_total: number | null;
  ban_count: number | null; ban_total: number | null;
};
export type Dataset = {
  schema: 1; exported_at: string; player_tag: string; profile: { name: string; fetched_at: string; trophies: number | null; icon_id?: number | null; owned_brawlers?: { name: string; power: number }[] } | null;
  matches: Battle[]; updates: Update[]; meta: Meta[];
};
export type Filters = { start: string; end: string; map_name: string; mode: string; player_brawler: string; rank_label: string; season: string };
export const emptyFilters: Filters = { start: '', end: '', map_name: '', mode: '', player_brawler: '', rank_label: '', season: '' };
export const initialTag = '';
export const emptyData: Dataset = { schema: 1, exported_at: '', player_tag: initialTag, profile: null, matches: [], updates: [], meta: [] };

const dayFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
});
export const localDay = (value: string) => dayFormatter.format(new Date(value));
export const dateTime = (value: string | null) => value ? dateTimeFormatter.format(new Date(value)) : '—';
export const number = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
export const percent = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1, minimumFractionDigits: 1, style: 'percent',
}).format(value);
export const normalize = (value: string | null | undefined) => (value ?? '').trim().toLocaleLowerCase('pt-BR');

const modeNames: Record<string, string> = {
  gemGrab: 'Pique-Gema', brawlBall: 'Fute-Brawl', heist: 'Roubo', bounty: 'Caça-Estrelas',
  hotZone: 'Zona Estratégica', knockout: 'Nocaute', wipeout: 'Extermínio',
  soloShowdown: 'Combate Solo', duoShowdown: 'Combate Duplo',
};
export const modeName = (value: string | null) => value ? modeNames[value] ?? value : '—';
export const resultName = (value: Battle['result']) => value ? ({ victory: 'Vitória', defeat: 'Derrota', draw: 'Empate' })[value] : 'Indisponível';

export function filtered(matches: Battle[], f: Filters, rankedOnly: boolean) {
  return matches.filter((battle) => {
    if (rankedOnly && !battle.ranked) return false;
    if (f.start || f.end) {
      const day = localDay(battle.played_at);
      if ((f.start && day < f.start) || (f.end && day > f.end)) return false;
    }
    return (['map_name', 'mode', 'player_brawler', 'rank_label', 'season'] as const).every(
      key => !f[key] || normalize(battle[key]) === normalize(f[key])
    );
  });
}

export function stats(battles: Battle[]) {
  const wins = battles.filter(x => x.result === 'victory').length;
  const losses = battles.filter(x => x.result === 'defeat').length;
  const draws = battles.filter(x => x.result === 'draw').length;
  const decided = wins + losses;
  return { wins, losses, draws, decided, games: battles.length, rate: decided ? wins / decided : null };
}

export function groupStats(battles: Battle[], labels: (battle: Battle) => (string | null)[]) {
  const groups = new Map<string, { label: string; rows: Battle[] }>();
  for (const battle of battles) {
    const unique = new Set<string>();
    for (const label of labels(battle)) {
      if (!label) continue;
      const key = normalize(label);
      if (unique.has(key)) continue;
      unique.add(key);
      const existing = groups.get(key);
      if (existing) existing.rows.push(battle);
      else groups.set(key, { label, rows: [battle] });
    }
  }
  return [...groups.values()].map(group => ({ label: group.label, ...stats(group.rows) }))
    .sort((a, b) => b.games - a.games || a.label.localeCompare(b.label));
}

export function draftStats(battles: Battle[]) {
  const picks = battles.filter(battle => battle.player_brawler);
  const drafts = battles.filter(battle => battle.bans !== null);
  const draftRows = new Map<string, { label: string; picks: number; bans: number }>();
  for (const battle of picks) {
    const label = battle.player_brawler!;
    const key = normalize(label);
    const row = draftRows.get(key) ?? { label, picks: 0, bans: 0 };
    row.picks++;
    draftRows.set(key, row);
  }
  for (const battle of drafts) {
    const used = new Set<string>();
    for (const label of battle.bans!) {
      const key = normalize(label);
      if (used.has(key)) continue;
      used.add(key);
      const row = draftRows.get(key) ?? { label, picks: 0, bans: 0 };
      row.bans++;
      draftRows.set(key, row);
    }
  }
  return { picks: picks.length, drafts: drafts.length,
    rows: [...draftRows.values()].sort((a, b) => b.picks - a.picks || b.bans - a.bans || a.label.localeCompare(b.label)) };
}

export function metaFor(meta: Meta[], f: Filters) {
  return meta.filter(row =>
    (!f.start || row.period_start >= f.start) && (!f.end || row.period_end <= f.end)
    && (!f.player_brawler || normalize(f.player_brawler) === normalize(row.brawler))
    && (['map_name', 'mode', 'rank_label', 'season'] as const).every(
      key => !f[key] || normalize(f[key]) === normalize(row[key])
    ));
}

export function comparable(battles: Battle[], row: Meta) {
  return filtered(battles, {
    start: row.period_start, end: row.period_end, map_name: row.map_name ?? '', mode: row.mode ?? '',
    rank_label: row.rank_label ?? '', season: row.season ?? '', player_brawler: row.brawler,
  }, true);
}

const isDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isText = (value: unknown) => value === null || typeof value === 'string';
const isCount = (value: unknown) => value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
export const safeLink = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;

export function parseSnapshot(value: unknown): Dataset {
  const d = value as Dataset | null;
  if (!d || d.schema !== 1 || !isDate(d.exported_at) || !/^#[0289PYLQGRJCUV]{3,16}$/.test(d.player_tag)
      || !Array.isArray(d.matches) || !Array.isArray(d.updates) || !Array.isArray(d.meta)
      || (d.profile !== null && (!d.profile || typeof d.profile.name !== 'string' ||
          !isDate(d.profile.fetched_at) || !isCount(d.profile.trophies)))
      || !d.matches.every(b => b && typeof b.id === 'string' && isDate(b.played_at) && typeof b.ranked === 'boolean'
          && [null, 'victory', 'defeat', 'draw'].includes(b.result) && isCount(b.rank_score)
          && isCount(b.duration_seconds) && [b.map_name, b.mode, b.api_type, b.player_brawler,
              b.rank_label, b.season, b.rank_reference, b.score_reference, b.season_reference, b.bans_reference, b.rank_source, b.score_source, b.season_source, b.bans_source].every(isText)
          && (b.bans === null || (Array.isArray(b.bans) && b.bans.every(v => typeof v === 'string')))
          && Array.isArray(b.players) && b.players.every(p => p && isCount(p.team_index)
              && [p.player_tag, p.player_name, p.brawler].every(isText) && isCount(p.power)
              && ['self', 'ally', 'opponent', 'unknown'].includes(p.side)))
      || !d.updates.every(row => row && isDate(row.started_at) && (row.finished_at === null || isDate(row.finished_at))
          && ['success', 'error', 'running'].includes(row.status) && isCount(row.received) && isCount(row.added)
          && isText(row.message))
      || !d.meta.every(row => row && typeof row.brawler === 'string' && typeof row.source_name === 'string'
          && typeof row.source_url === 'string' && Boolean(safeLink(row.source_url)) && isDate(row.period_start)
          && isDate(row.period_end) && [row.map_name, row.mode, row.rank_label, row.season].every(isText)
          && [row.wins, row.games, row.pick_count, row.pick_total, row.ban_count, row.ban_total].every(isCount)
          && row.games > 0 && row.wins <= row.games)) {
    throw new Error('Arquivo incompatível. Use o JSON exportado pelo aplicativo local.');
  }
  return { ...d, matches: [...d.matches].sort((a, b) => b.played_at.localeCompare(a.played_at)) };
}
