export type DraftMetaBrawler = { name: string; win_rate: number; games: number };
type Movement = { name: string; win_change: number; pick_change: number; games: number };
type Window = { start: string; end: string; battles: number };
export type DraftMetaSnapshot = Window & {
  provider: string; patch_date: string; map: string | null; source_url: string; fetched_at: string; fresh: boolean;
  tiers: { tier: string; brawlers: DraftMetaBrawler[] }[];
  map_picks: { name: string; pick_rate: number }[];
  presence?: { name: string; pick_rate: number }[] | null;
  movements: {
    current?: Window; previous: Window; source_url: string; win_risers: Movement[]; win_fallers: Movement[];
    pick_risers: Movement[]; pick_fallers: Movement[];
  } | null;
};

type Coverage = { patch_date: string; updated_at: string;
  maps: { name: string; status: 'updated'|'unavailable'|'pending'; saved: boolean }[] };
export type DraftMetaResponse = {
  snapshot: DraftMetaSnapshot|null; patches: string[]; coverage?: Coverage|null; saved_maps?: string[];
};

export type DraftSuggestionRequest = {
  map: string; our_picks: string[]; enemy_picks: string[]; bans: string[]; first_pick: boolean;
};
export type DraftSuggestionResponse = {
  source_url: string;
  current_chance: number;
  suggestions: { name: string; after_pick: number; after_reply: number|null; reply: string|null }[];
};

export function draftMetaMapKey(name: string) {
  return name.trim().toLowerCase().replace(/['’‘]/g, '');
}

export function draftMetaPicks(snapshot: DraftMetaSnapshot|null) {
  const rates = new Map((snapshot?.presence??snapshot?.map_picks)?.map(row=>[row.name,row.pick_rate]));
  return snapshot?.tiers.flatMap(tier=>tier.brawlers.map(row=>({
    name:row.name, games:row.games, winRate:row.win_rate/100,
    presence:rates.has(row.name)?rates.get(row.name)!/100:null, tier:tier.tier,
  }))) ?? [];
}
