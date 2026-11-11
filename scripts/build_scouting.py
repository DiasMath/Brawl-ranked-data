"""Build anonymous draft aggregates from the Season 55 public Parquet file."""
import argparse
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1] / "frontend"
URL = "https://huggingface.co/datasets/EliF77/brawlstars-ranked"


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def build(parquet):
    catalog = json.loads((ROOT / "app/catalog/game.json").read_text(encoding="utf-8"))
    ids = {row["name"].upper(): row["id"] for row in catalog["brawlers"]}
    db = duckdb.connect(config={"threads": 4, "memory_limit": "2GB"})
    db.execute("CREATE TABLE roster (name VARCHAR, id INTEGER)")
    db.executemany("INSERT INTO roster VALUES (?,?)", list(ids.items()))
    teams = [[f"t{team}_b{slot}_name" for slot in range(3)] for team in (1, 2)]
    names = [column for team in teams for column in team]
    joined = " ".join(f"JOIN roster r{i} ON upper({name})=r{i}.name" for i, name in enumerate(names))
    db.execute(f"""
        CREATE TABLE sets AS
        SELECT mode, map,
               [r0.id,r1.id,r2.id] AS first, [r3.id,r4.id,r5.id] AS second,
               list_count(list_filter(string_split(record,'-'), x -> x='T1')) AS t1_wins,
               list_count(list_filter(string_split(record,'-'), x -> x='T2')) AS t2_wins
        FROM read_parquet(?) {joined}
        WHERE battle_time >= '20261104T030000.000Z' AND battle_time < '20261106T030000.000Z'
          AND mode IS NOT NULL AND map IS NOT NULL
          AND ((t1_wins=2 AND t2_wins<2) OR (t2_wins=2 AND t1_wins<2))
    """, [str(parquet)])
    groups = "GROUP BY GROUPING SETS ((mode,map), (mode), ())"
    counts = db.execute(f"SELECT mode,map,count(*) FROM sets {groups} ORDER BY mode NULLS FIRST, map NULLS FIRST").fetchall()
    db.execute("""
        CREATE VIEW sides AS
        SELECT mode,map,first AS team,second AS enemy,t1_wins=2 AS won FROM sets
        UNION ALL
        SELECT mode,map,second AS team,first AS enemy,t2_wins=2 AS won FROM sets
    """)
    pick_rows = db.execute("""
        SELECT mode,map,brawler,count_if(won),count(*)
        FROM sides, unnest(team) t(brawler)
        GROUP BY GROUPING SETS ((mode,map,brawler), (mode,brawler), (brawler))
        HAVING count(*) >= 25 ORDER BY brawler
    """).fetchall()
    pair_rows = db.execute("""
        SELECT mode,map,brawler,opponent,count_if(won),count(*)
        FROM sides, unnest(team) t(brawler), unnest(enemy) e(opponent)
        WHERE brawler != opponent
        GROUP BY GROUPING SETS ((mode,map,brawler,opponent), (mode,brawler,opponent), (brawler,opponent))
        HAVING count(*) >= 30 ORDER BY brawler,opponent
    """).fetchall()
    ally_rows = db.execute("""
        SELECT mode,map,brawler,ally,count_if(won),count(*)
        FROM sides, unnest(team) t(brawler), unnest(team) e(ally)
        WHERE brawler != ally
        GROUP BY GROUPING SETS ((mode,map,brawler,ally), (mode,brawler,ally), (brawler,ally))
        HAVING count(*) >= 30 ORDER BY brawler,ally
    """).fetchall()
    aggregate = {(mode, name): {"picks": [], "pairs": [], "allies": []} for mode, name, _ in counts}
    for mode, name, brawler, wins, games in pick_rows:
        aggregate[mode, name]["picks"].append((brawler, wins, games))
    for mode, name, brawler, enemy, wins, games in pair_rows:
        aggregate[mode, name]["pairs"].append((brawler, enemy, wins, games))
    for mode, name, brawler, ally, wins, games in ally_rows:
        aggregate[mode, name]["allies"].append((brawler, ally, wins, games))
    out = ROOT / "public/scouting"
    out.mkdir(parents=True, exist_ok=True)
    contexts = []
    for i, (mode, name, sets) in enumerate(counts):
        key = f"s{i}"
        contexts.append(dict(key=key, mode=mode, map=name, sets=sets))
        dump(out / f"{key}.json", aggregate[mode, name])
    dump(out / "index.json", dict(source="EliF77 · Ranqueado S55", url=URL, start="2026-11-04",
         end="2026-11-05", season="season55", contexts=contexts))
    print(f"{counts[0][2]:,} decisive sets, {len(contexts)} scopes, {len(pair_rows):,} matchup aggregates")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parquet", type=Path, help="Season 55 source file from " + URL)
    build(parser.parse_args().parquet)
