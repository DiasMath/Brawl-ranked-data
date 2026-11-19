const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Compile the domain modules with the project's TypeScript version; no DOM or API fixtures are required.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop:true },
}).outputText, filename);
const { emptyData, stats } = require('../src/lib/data.ts');
const { rankedSeasonIndex } = require('../src/lib/ranked-seasons.ts');
const { matchSeries, matchEloChanges, completedRankedSeries, completedRankedMatch, eloByScore, eloContext, seriesPerformance } = require('../src/lib/match-series.ts');
const { seasonCohorts } = require('../src/lib/season-comparison.ts');

const boundary = '2026-11-19T00:00:00.000Z';
const calendar = [
  { id: 'old', label: 'Temporada 50', starts_at: '2026-10-16T00:00:00.000Z', ends_at: boundary, date_only: true },
  { id: 'new', label: 'Temporada 51 (prevista)', starts_at: boundary, ends_at: '2026-12-17T00:00:00.000Z', date_only: true },
];
const players = Array.from({ length: 6 }, (_, i) => ({
  player_tag: `#TEST${i}`, brawler: `Brawler ${i}`, brawler_id: 16000000 + i,
  side: i === 0 ? 'self' : i < 3 ? 'ally' : 'opponent',
}));
const row = (id, at, result, season = null, extra = {}) => ({
  id, played_at: at, result, season, ranked: true, api_type: 'soloRanked', event_id: 1,
  map_name: 'Test map', mode: 'gemGrab', players, duration_seconds: 65, delay_observed: true,
  season_source: null, ...extra,
});
const index = matches => rankedSeasonIndex({ ...emptyData, matches, ranked_seasons: calendar }, []);

test('the provisional cut includes the very first day without overwriting official seasons', () => {
  const before = row('before', '2026-11-18T23:59:59.999Z', 'victory');
  const after = row('after', boundary, 'victory');
  const stillOld = row('old', '2026-11-19T05:00:00.000Z', 'defeat', '50');
  const newOfficial = row('new', '2026-11-19T08:00:00.000Z', 'victory', '51');
  const resolver = index([before, after, stillOld, newOfficial]);
  assert.deepEqual(resolver.battle(before), { season: 'Temporada 50', seasonEstimated: true });
  assert.deepEqual(resolver.battle(after), { season: 'Temporada 51', seasonEstimated: true });
  assert.deepEqual(resolver.battle(stillOld), { season: 'Temporada 50', seasonEstimated: false });
  assert.equal(resolver.selection('Temporada 51 (prevista)'), 'Temporada 51');
  assert.equal(resolver.selection('new'), 'Temporada 51');
  assert.equal(resolver.battle(newOfficial).seasonEstimated, false);
});

test('one ranked round remains open, a comeback counts as one victory and casual results remain valid', () => {
  const rounds = [row('a', '2026-11-19T09:00:00Z', 'defeat', '51'),
    row('b', '2026-11-19T09:02:00Z', 'victory', '51'), row('c', '2026-11-19T09:04:00Z', 'victory', '51')];
  const incomplete = matchSeries(rounds.slice(0, 1));
  assert.equal(incomplete[0].result, null);
  assert.equal(completedRankedSeries(incomplete[0]), false);
  assert.equal(stats(incomplete).decided, 0);
  assert.equal(stats(incomplete).games, 1);
  assert.equal(matchSeries(rounds.slice(0, 2))[0].result, null);
  const [complete] = matchSeries(rounds);
  assert.equal(complete.result, 'victory');
  assert.equal(complete.wins, 2);
  assert.equal(complete.losses, 1);
  assert.equal(completedRankedSeries(complete), true);
  assert.equal(stats([complete]).wins, 1);
  assert.equal(matchSeries([{ ...rounds[0], ranked: false }])[0].result, 'defeat');
});

test('official identity takes precedence across an estimated cut, while different seasons never group', () => {
  const before = row('a', '2026-11-18T23:59:00Z', 'victory', '50', { season_window: 'old' });
  const after = row('b', '2026-11-19T00:01:00Z', 'victory', '50', { season_window: 'new' });
  assert.equal(matchSeries([before, after]).length, 1);
  assert.equal(matchSeries([before, { ...after, season: '51' }]).length, 2);
  assert.equal(matchSeries([{ ...before, season: null }, { ...after, season: null }]).length, 2);
  const cohorts = seasonCohorts(matchSeries([before, after]), calendar, Date.parse('2026-11-19T10:00:00Z'));
  assert.equal(cohorts.bySeason.get('old').length, 1);
  assert.equal(cohorts.bySeason.get('new').length, 0);
});

test('the Elo reset cannot become a match loss or gain', () => {
  const matches = matchSeries([row('a', '2026-11-19T09:00:00Z', 'defeat'),
    row('b', '2026-11-19T09:02:00Z', 'defeat')]);
  const readings = [
    { at: '2026-11-19T08:59:00Z', score: 9000, season: '50' },
    { at: '2026-11-19T09:04:00Z', score: 4500, season: '51' },
  ].map(reading => ({ ...reading, method: 'api', id: `server:${reading.at}` }));
  assert.equal(matchEloChanges(matches, readings).size, 0);
});

test('confirmed lower-rank single games count individually without merging rematches', () => {
  const first = row('first', '2026-11-19T09:00:00Z', 'victory', '51', { rank_label: 'Diamante III', rank_score: 4100 });
  const second = { ...first, id: 'second', played_at: '2026-11-19T09:02:00Z', result: 'defeat' };
  const games = matchSeries([first, second]);
  assert.equal(games.length, 2);
  assert.deepEqual(stats(games), { wins: 1, losses: 1, draws: 0, decided: 2, games: 2, rate: .5 });
  assert.ok(games.every(completedRankedMatch));
  assert.ok(games.every(game => !completedRankedSeries(game)));
  const performance = seriesPerformance(games);
  assert.equal(performance.victories.count, 1);
  assert.equal(performance.defeats.count, 1);
  assert.equal(performance.lostOpening, 0);
  assert.equal(matchSeries([{ ...first, rank_label: 'Mítico I', rank_score: 4500 }])[0].result, null);
  assert.equal(matchSeries([{ ...first, rank_label: null, rank_score: null }])[0].result, null);
  assert.equal(matchSeries([{ ...first, rank_source: 'evidência', score_source: 'evidência' }])[0].result, null);
  assert.equal(matchSeries([{ ...first, played_at: '2026-10-19T09:00:00Z' }])[0].result, null);
  assert.equal(matchSeries([{ ...first, rank_score: 5500 }])[0].result, null);
});

test('Elo averages separate scorelines, missing deltas, seasons and divisions', () => {
  const make = (id, results, season='51', rank='Mítico III') => matchSeries(results.map((result, i) =>
    row(`${id}${i}`, `2026-11-19T10:0${i*2}:00Z`, result, season, { rank_label: rank, rank_score: null })))[0];
  const epic = make('epic', ['victory', 'victory']);
  const close = make('close', ['victory', 'defeat', 'victory']);
  const closeLoss = make('loss', ['victory', 'defeat', 'defeat']);
  const noReading = make('unknown', ['defeat', 'defeat']);
  const previous = make('old', ['victory', 'victory'], '50');
  const otherRank = make('rank', ['victory', 'victory'], '51', 'Lendário I');
  const elo = new Map([[epic.id,{before:5500,after:5600,rank:'Mítico III'}],
    [close.id,{before:5500,after:5560,rank:'Mítico III'}], [closeLoss.id,{before:5500,after:5470,rank:'Mítico III'}],
    [previous.id,{before:7500,after:7700}], [otherRank.id,{before:6000,after:6200}]]);
  const scope = eloContext([epic,close,closeLoss,noReading,previous,otherRank],elo,'Temporada 51','Mítico III');
  assert.equal(scope.length,4);
  assert.equal(eloContext(scope,elo,null).length,0);
  const rows=eloByScore(scope,elo);
  assert.deepEqual(rows.find(row=>row.score==='2–0'),{score:'2–0',result:'victory',count:1,points:100,total:1});
  assert.equal(rows.find(row=>row.score==='2–1').points,60);
  assert.equal(rows.find(row=>row.score==='1–2').points,30);
  assert.equal(rows.find(row=>row.score==='0–2').points,null);
  assert.equal(rows.find(row=>row.score==='0–2').total,1);
});
