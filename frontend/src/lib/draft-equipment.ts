import { byBrawlerName } from '@/components/game';
import equipment from '@/lib/catalog/equipment.json';
import { normalize } from '@/lib/data';
import type { Equipment, OwnedBrawler } from '@/lib/data';

type Item = { id: number | null; name: string; description: string; reason?: string; unlocked?: boolean };
type Category = 'gadgets' | 'starPowers' | 'gears';
const catalog: Record<string, Record<Exclude<Category, 'gears'>, Item[]>> = equipment;
const shortRangeRoles = new Set(['Tank', 'Assassin']);
const commonGears: Record<string, Item> = {
  shield: {id:62000004,name:'Escudo',description:'Absorve parte do dano inicial.'},
  health: {id:62000001,name:'Saúde',description:'Recupera vida com mais eficiência.'},
  damage: {id:62000002,name:'Dano',description:'Aumenta o dano com vida baixa.'},
  vision: {id:62000003,name:'Visão',description:'Revela adversários após causar dano.'},
};

export function draftEquipment(name: string, mode: string | null, enemies: string[], owned?: OwnedBrawler) {
  const brawler = byBrawlerName.get(normalize(name));
  const items = brawler ? catalog[brawler.id] : undefined;
  const dive = enemies.some(enemy => shortRangeRoles.has(byBrawlerName.get(normalize(enemy))?.role ?? ''));
  const closeRange = brawler && shortRangeRoles.has(brawler.role);
  const defensive = /shield|heal|push(?:es)? back|knock(?:s)? back|stun|slow|take no damage|immun|reflect/i;
  const objective = /extra damage|more damage|increas.{0,25}damage|faster reload|attack speed/i;
  const priority = (item: Item) => dive && defensive.test(item.description) ? 'Proteção contra aproximação' :
    mode === 'heist' && objective.test(item.description) ? 'Pressão e dano no Cofre' : undefined;

  function options(available: Item[], inventory?: Equipment[] | null) {
    return available.map(item => ({...item, reason:priority(item),
      unlocked:inventory?.some(entry => entry.id === item.id || normalize(entry.name) === normalize(item.name))}))
      .sort((a,b) => Number(b.unlocked === true) - Number(a.unlocked === true) ||
        Number(Boolean(b.reason)) - Number(Boolean(a.reason)));
  }

  const gearOrder = mode === 'heist' ? ['damage','shield'] : dive && !closeRange ? ['shield','health'] :
    mode === 'hotZone' ? ['health','shield'] : closeRange ? ['damage','health'] : ['shield','damage'];
  if (mode === 'gemGrab' || mode === 'bounty') gearOrder.push('vision');
  const alternatives = Object.keys(commonGears).filter(key => !gearOrder.includes(key) &&
    owned?.gears?.some(gear=>gear.id===commonGears[key].id));
  const gears = [...gearOrder,...alternatives].map(key => commonGears[key]).map(item => ({
    ...item, reason:item.description,
    unlocked:owned?.gears?.some(gear => gear.id === item.id),
  })).sort((a,b) => Number(b.unlocked === true) - Number(a.unlocked === true)).slice(0,3);

  return {
    gadgets:options(items?.gadgets ?? [], owned?.gadgets),
    starPowers:options(items?.starPowers ?? [], owned?.star_powers),
    gears,
  };
}
