type Action = 'ban' | 'pick';

const aliases = new Map([
  ['hico', 'rico'], ['shaly', 'shelly'], ['shely', 'shelly'], ['shelley', 'shelly'],
  ['xeli', 'shelly'], ['cheli', 'shelly'], ['collet', 'colette'],
  ['colete', 'colette'], ['paiper', 'piper'], ['larryelawrie', 'larrylawrie'],
]);

function words(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function nameKey(value: string) {
  const key = words(value).replace(/ /g, '');
  if (/^(8|oito)bits?$/.test(key)) return '8bit';
  if (key === 'erte' || key === 'errete') return 'rt';
  return aliases.get(key) ?? key;
}

export function recognizeBrawler(transcript: string, action: Action, roster: readonly { name: string }[], allowTrailing = true) {
  const utterance = words(transcript);
  const command = /^(ban|banir|bani|bana|banimento|pick|pickar|picar|escolher|escolha|escolhe|esco|selecionar|selecione) (?:(?:o|a|um|uma) )?(.+)$/.exec(utterance);
  if (command && (command[1].startsWith('ban') ? 'ban' : 'pick') !== action) {
    return { options: [], opposite: true };
  }
  const value = (command?.[2] ?? utterance).replace(/^brawler /, '');
  const keys = [nameKey(value)];
  // Whisper can split "escolher" across two words and attach its ending to the name.
  if (command?.[1] === 'esco') keys.push(nameKey(value.replace(/^her(?=[a-z])/, '')));
  const exact = roster.filter(brawler => keys.includes(nameKey(brawler.name)));
  if (exact.length || !allowTrailing) return { options: exact.map(brawler => brawler.name), opposite: false };

  // The verb can be misheard even when the last word is a recognizable brawler.
  const mentions = roster.filter(brawler => {
    const name = words(brawler.name);
    return name.length > 2 && ` ${value} `.includes(` ${name} `);
  });
  const candidate = mentions.length === 1 && value.endsWith(` ${words(mentions[0].name)}`) ? mentions[0] : null;
  return { options: candidate ? [candidate.name] : [], opposite: false };
}

export function recognizeBans(transcript: string, roster: readonly { name: string }[]) {
  const single = recognizeBrawler(transcript, 'ban', roster, false);
  if (single.opposite) return [];
  if (single.options.length === 1) return [{ name: single.options[0], heard: '' }];

  const utterance = words(transcript)
    .replace(/^(?:banir|bans?|bani|bana|banimento|[pb]anei?r[oa]?) (?:os |as |o |a )?/, '');
  if (!utterance) return [];
  const names = new Map(roster.map(({ name }) => [nameKey(name), name]));
  const tokens = utterance.split(' ');
  const result: { name: string; heard: string }[] = [];
  let unmatched: string[] = [];
  for (let i = 0; i < tokens.length;) {
    if (tokens[i] === 'e') {
      i++;
      continue;
    }
    let width = Math.min(4, tokens.length - i);
    let name: string | undefined;
    for (; width > 0; width--) {
      const candidate = tokens.slice(i, i + width);
      name = names.get(nameKey(candidate.join(' ')));
      if (name) break;
    }
    if (!name) {
      unmatched.push(tokens[i++]);
      continue;
    }
    if (unmatched.length) result.push({ name: '', heard: unmatched.join(' ') });
    unmatched = [];
    result.push({ name, heard: '' });
    i += width;
  }
  if (unmatched.length) result.push({ name: '', heard: unmatched.join(' ') });
  return result;
}
