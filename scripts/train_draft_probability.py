"""Fit a map-aware draft estimate using decisive series from the EliF77 Parquet.

Run with duckdb, numpy and scipy installed. The JSON contains aggregate weights only.
"""
import argparse
import json
from pathlib import Path

import duckdb
import numpy as np
from scipy.optimize import minimize
from scipy.special import expit
from scipy.sparse import csr_matrix

from build_scouting import ROOT, URL, dump


def train(parquet):
    roster = json.loads((ROOT / "src/lib/catalog/game.json").read_text(encoding="utf-8"))["brawlers"]
    db = duckdb.connect(config={"threads": 4, "memory_limit": "1GB"})
    db.execute("CREATE TABLE roster (name VARCHAR, idx INTEGER)")
    db.executemany("INSERT INTO roster VALUES (?,?)", [(row["name"].upper(), i) for i, row in enumerate(roster)])
    joins = " ".join(f"JOIN roster r{i} ON upper(t{1+i//3}_b{i%3}_name)=r{i}.name" for i in range(6))
    slots = ", ".join(f"r{i}.idx" for i in range(6))
    features = ", ".join(f"r{i}.idx AS pick{i}" for i in range(6))
    db.execute(f"""
        CREATE TEMP TABLE series AS
        SELECT mode, map, battle_time < '20261105T030000.000Z' AS train, {features}, t1_wins=2 AS won
        FROM (
            SELECT *, list_count(list_filter(string_split(record,'-'), x -> x='T1')) AS t1_wins,
                      list_count(list_filter(string_split(record,'-'), x -> x='T2')) AS t2_wins
            FROM read_parquet(?)
            WHERE battle_time >= '20261104T030000.000Z' AND battle_time < '20261106T030000.000Z'
        ) {joins}
        WHERE mode IS NOT NULL AND map IS NOT NULL
          AND ((t1_wins=2 AND t2_wins<2) OR (t2_wins=2 AND t1_wins<2))
          AND list_unique([{slots}])=6
    """, [str(parquet)])
    scopes = db.execute("""
        SELECT mode,map,count_if(train) AS training,count_if(NOT train) AS validation
        FROM series GROUP BY mode,map HAVING training>=500 AND validation>=100 ORDER BY mode,map
    """).fetchall()
    db.execute("CREATE TABLE scopes (mode VARCHAR, map VARCHAR, idx INTEGER)")
    db.executemany("INSERT INTO scopes VALUES (?,?,?)", [(mode, name, i) for i, (mode, name, _, _) in enumerate(scopes)])
    rows = db.execute("SELECT series.*, scopes.idx AS map_idx FROM series JOIN scopes USING (mode,map)").fetchnumpy()
    picks = np.column_stack([rows[f"pick{i}"] for i in range(6)])
    map_ids = rows["map_idx"]
    width = len(roster)
    map_columns = picks + width * (1 + map_ids[:, None])
    columns = np.column_stack((picks, map_columns))
    signs = np.tile([1., 1., 1., -1., -1., -1.] * 2, len(picks))
    design = csr_matrix((signs, columns.ravel(), np.arange(0, 12 * (len(picks) + 1), 12)),
                        shape=(len(picks), width * (1 + len(scopes))))
    training = rows["train"]
    x, y = design[training], rows["won"][training]
    regularization = np.repeat([20., *([40.] * len(scopes))], width)

    def loss(weights):
        logit = x @ weights
        value = (np.logaddexp(0, logit) - y * logit).sum() + 0.5 * np.dot(regularization, weights ** 2)
        return value, x.T @ (expit(logit) - y) + regularization * weights

    fitted = minimize(loss, np.zeros(design.shape[1]), jac=True, method="L-BFGS-B",
                      options={"maxiter": 400, "ftol": 1e-10})
    if not fitted.success:
        raise RuntimeError(fitted.message)
    weights = fitted.x.reshape(-1, width)
    logit = design[~training] @ fitted.x
    truth = rows["won"][~training]
    brier = float(np.mean((expit(logit) - truth) ** 2))
    if brier >= 0.25:
        raise RuntimeError("A projeção não superou a referência de 50% no dia de validação.")

    maps = []
    for i, (mode, name, samples, holdout) in enumerate(scopes):
        support = np.bincount(picks[(map_ids == i) & training].ravel(), minlength=width)
        scores = [round(float(score) * 1000) if count >= 30 else None
                  for score, count in zip(weights[0] + weights[i+1], support)]
        maps.append({"map": name, "mode": mode, "series": samples, "holdout": holdout, "scores": scores})
    dump(ROOT / "src/lib/catalog/draft-probability.json", {
        "source": URL, "trained": "2026-11-04", "validated": "2026-11-05",
        "validation_series": int((~training).sum()), "brier": round(brier, 5),
        "ids": [row["id"] for row in roster], "maps": maps,
    })
    print(f"{int(training.sum()):,} séries de treino, {int((~training).sum()):,} de validação, {len(maps)} mapas, Brier {brier:.5f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parquet", type=Path)
    train(parser.parse_args().parquet)
