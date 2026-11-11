import { useState } from 'react';
import { Map as MapIcon, Shield, Swords } from 'lucide-react';
import catalog from '@/lib/catalog/game.json';
import rankData from '@/lib/catalog/ranks.json';
import { modeName, normalize } from '@/lib/data';

export const { brawlers, modes, maps } = catalog;
export const byBrawlerName = new Map(brawlers.map(b => [normalize(b.name), b]));
export const byModeId = new Map(modes.map(m => [m.id, m]));
export const byModeKey = new Map(modes.map(m => [m.key, m]));
export type GameMap = typeof maps[number];
const byMapId = new Map(maps.map(m => [m.id, m]));
export const rankedModes = ['gemGrab', 'brawlBall', 'heist', 'bounty', 'hotZone', 'knockout', 'wipeout'];
export const pickableModes = rankedModes.flatMap(key => byModeKey.get(key) ?? []);

export function findMap(name?: string | null, id?: number | null, mode?: string | null) {
  if (id && byMapId.has(id)) return byMapId.get(id);
  if (!name) return undefined;
  const key = normalize(name).replace(/[’‘]/g, "'");
  const relevant = maps.filter(m => normalize(m.name).replace(/[’‘]/g, "'") === key);
  return relevant.find(m => byModeId.get(m.mode)?.key === mode) ?? relevant.find(m => !m.disabled) ?? relevant[0];
}

export const roleName = (role: string) => ({
  'Damage Dealer': 'Dano', Assassin: 'Assassino', Marksman: 'Atirador', Controller: 'Controle',
  Artillery: 'Artilharia', Tank: 'Tanque', Support: 'Suporte',
}[role] ?? role);

function Asset({ src, fallback, alt = '', className = '', eager = false }: {
  src: string; fallback?: string; alt?: string; className?: string; eager?: boolean;
}) {
  const [failed, setFailed] = useState(0);
  if (failed > (fallback ? 1 : 0)) return <span className={`asset-fallback ${className}`} aria-label={alt} />;
  return <img src={failed ? fallback : src} alt={alt} className={className} loading={eager ? 'eager' : 'lazy'}
    referrerPolicy="no-referrer" onError={() => setFailed(v => v + 1)} draggable={false} />;
}

export function Portrait({ name, id, className = '', alt = '' }: { name?: string | null; id?: number | null; className?: string; alt?: string }) {
  const key = id ?? byBrawlerName.get(normalize(name))?.id;
  if (!key) return <span className={`portrait portrait-empty ${className}`}><Swords size={15} /></span>;
  return <Asset key={key} src={`/game/b/${key}.webp`} fallback={`https://cdn.brawlify.com/brawlers/borders/${key}.png`}
    alt={alt} className={`portrait ${className}`} />;
}

export function ModeIcon({ mode }: { mode: string | null }) {
  const entry = mode ? byModeKey.get(mode) : undefined;
  return entry ? <Asset key={entry.id} src={`/game/m/${entry.id}.webp`} fallback={`https://cdn.brawlify.com/game-modes/regular/${entry.id}.png`} className="mode-icon" />
    : <MapIcon className="mode-icon" size={19} />;
}

export function MapImage({ map, className = '' }: { map?: GameMap; className?: string }) {
  if (!map) return <span className={`map-image map-fallback ${className}`}><MapIcon size={28} /></span>;
  const cdn = `https://cdn.brawlify.com/maps/regular/${map.id}.png`;
  const bundled = new Set(['Hard Rock Mine','Center Stage','Canal Grande','Belle’s Rock',"Belle's Rock",'Shooting Star','Open Business',
    'Ring of Fire','Pinball Dreams','Safe Zone','Pit Stop','Double Swoosh','Dueling Beetles','Crystal Arcade','Goldarm Gulch','Sneaky Fields']);
  return <Asset key={map.id} src={bundled.has(map.name) ? `/game/map/${map.id}.webp` : cdn}
    fallback={bundled.has(map.name) ? cdn : `https://raw.githubusercontent.com/Brawlify/CDN/master/maps/regular/${map.id}.png`}
    alt={map.name} className={`map-image ${className}`} />;
}

const normalizeRank = (value?: string|null) => normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s([123])$/, (_, digit) => ['',' I',' II',' III'][Number(digit)]);
export const rankDivisions = rankData;
export function gameRank(value?: string|number|null) {
  if (typeof value === 'number') return rankData.find(r=>r.id===value);
  const query = normalizeRank(value);
  return rankData.find(r=>[r.key,r.label].some(label=>normalizeRank(label)===query));
}
export function referenceRank(score?: number|null) {
  return score==null ? undefined : rankData.findLast(r=>score>=r.floor);
}
export function nextRank(value?: string|null, score?: number|null) {
  const observed = gameRank(value);
  if (observed) return rankData[rankData.indexOf(observed)+1];
  if (score != null) return rankData.find(r=>r.floor>score);
  return undefined;
}
export function RankArt({ rank, className = '' }: { rank?: string | null; className?: string }) {
  const division = gameRank(rank);
  const tier = division?.tier ?? rankData.find(r=>normalizeRank(r.key.split(' ')[0])===normalizeRank(rank) ||
    normalizeRank(r.label.split(' ')[0])===normalizeRank(rank))?.tier;
  return <Asset key={division?.id ?? tier ?? 'ranked'} src={division ? `/game/r/${division.id}.webp` : tier ? `/game/r/${tier}.webp` : '/game/ranked.webp'}
    fallback={tier ? `/game/r/${tier}.webp` : undefined} className={`rank-art ${className}`} alt="" eager />;
}
export function TrophyArt() {
  return <span className="trophy-art"><img src="/game/trophy.webp" alt="" /></span>;
}

export function ModeLabel({ mode }: { mode: string | null }) {
  return <span className="image-label"><ModeIcon mode={mode} />{modeName(mode)}</span>;
}

export function AccountIcon({ id }: { id?: number | null }) {
  return id ? <Asset key={id} src={`https://cdn.brawlify.com/profile-icons/regular/${id}.png`} className="profile-icon" />
    : <span className="profile-icon profile-fallback"><Shield size={21} /></span>;
}
