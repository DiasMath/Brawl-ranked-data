from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from hashlib import sha256
from itertools import permutations

from ..config import meta_min_elo
from ..domain import encoded, iso, obj, parse_battle, tag
from .supercell import CollectionError, fetch


def sample_battle(item, player):
    try:
        battle = parse_battle(item, player)
    except (AttributeError, KeyError, TypeError, ValueError):
        return None
    if not all((battle["ranked"], battle["map_name"], battle["mode"], battle["result"])):
        return None
    teams = defaultdict(list)
    own_team = None
    for team, _, player_tag, _, brawler_id, _, _, side in battle["players"]:
        if not player_tag or not brawler_id:
            return None
        teams[team].append((player_tag, brawler_id))
        if side == "self":
            own_team = team
    if (own_team is None or len(teams) != 2 or any(len(members) != 3 for members in teams.values())
            or len({member[0] for members in teams.values() for member in members}) != 6):
        return None
    ordered = sorted(teams, key=lambda team: sorted(teams[team]))
    identities = [sorted(teams[team]) for team in ordered]
    played_at = battle["played_at"]
    match_id = sha256(encoded([iso(played_at), identities]).encode()).hexdigest()
    winning_index = None if battle["result"] == "draw" else ordered.index(own_team)
    if battle["result"] == "defeat":
        winning_index = 1 - winning_index
    return (match_id, played_at, battle["map_name"], battle["mode"],
            [brawler for _, brawler in identities[0]], [brawler for _, brawler in identities[1]], winning_index)


def choose_players(client, excluded, *, limit=10, count=5):
    response = fetch(client, f"rankings/global/players?limit={limit}")
    items = response.get("items")
    if not isinstance(items, list):
        raise CollectionError(502, "A classificação pública veio sem uma lista de jogadores.")
    players = []
    for row in items:
        try:
            player = tag(row.get("tag"))
        except (AttributeError, ValueError):
            continue
        if player not in excluded and player not in players:
            players.append(player)
    return players[:count]


def player_battlelog(client, player):
    response = fetch(client, "players/%23" + player[1:] + "/battlelog")
    items = response.get("items")
    if not isinstance(items, list):
        raise CollectionError(502, "A API retornou um histórico inesperado para a amostra.")
    return items


def discovered_players(items):
    found = set()
    for item in items:
        groups = obj(obj(item).get("battle")).get("teams")
        for team in groups if isinstance(groups, list) else ():
            for member in team if isinstance(team, list) else ():
                try:
                    found.add(tag(obj(member).get("tag")))
                except ValueError:
                    continue
    return found


def sample_players(client, players):
    def read(player):
        try:
            items = player_battlelog(client, player)
        except CollectionError as error:
            return error
        return [row for item in items if (row := sample_battle(item, player)) is not None]

    with ThreadPoolExecutor(max_workers=5) as workers:
        results = list(workers.map(read, players))
    errors = [result for result in results if isinstance(result, CollectionError)]
    limited = next((error for error in errors if error.status_code == 429), None)
    if limited:
        raise limited
    if errors and len(errors) == len(players):
        raise errors[0]
    return {row[0]: row for result in results if isinstance(result, list) for row in result}, len(errors)


def save_sample(cursor, battles, observed_elo=None):
    added = 0
    for row in battles.values():
        cursor.execute("""
            INSERT INTO meta_sample_battles (id, played_at, map_name, mode, team_a, team_b, winner, observed_elo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING
        """, (*row, observed_elo))
        added += cursor.rowcount
        if cursor.rowcount == 0 and observed_elo is not None:
            cursor.execute("""
                UPDATE meta_sample_battles SET observed_elo=%s
                WHERE id=%s AND (observed_elo IS NULL OR observed_elo < %s)
            """, (observed_elo, row[0], observed_elo))
    return added


def summarize_context(rows, mode, map_name):
    picks = defaultdict(lambda: [0, 0, 0])
    pairs = defaultdict(lambda: [0, 0])
    allies = defaultdict(lambda: [0, 0])
    decisive = 0
    for row in rows:
        teams = (row["team_a"], row["team_b"])
        winner = row["winner"]
        decisive += int(winner is not None)
        for index, team in enumerate(teams):
            won = int(winner == index)
            for brawler in team:
                stat = picks[brawler]
                stat[2] += 1
                if winner is None:
                    continue
                stat[0] += won
                stat[1] += 1
                for opponent in teams[1-index]:
                    record = pairs[brawler, opponent]
                    record[0] += won
                    record[1] += 1
            if winner is not None:
                for first, second in permutations(team, 2):
                    record = allies[first, second]
                    record[0] += won
                    record[1] += 1
    return {
        "mode": mode, "map": map_name, "sets": len(rows), "decisive": decisive,
        "latest": iso(max(row["played_at"] for row in rows)),
        "sample": {"picks": [[key, *stat] for key, stat in picks.items()],
                   "pairs": [[*key, *stat] for key, stat in pairs.items()],
                   "allies": [[*key, *stat] for key, stat in allies.items()]},
    }


def sample_report(cursor):
    minimum = meta_min_elo()
    cursor.execute("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date AS today")
    today = cursor.fetchone()["today"]
    cursor.execute("""
        SELECT played_at, map_name, mode, team_a, team_b, winner, observed_elo,
               ((played_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date AS day
        FROM meta_sample_battles
        WHERE played_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '8 days'
    """)
    rows = cursor.fetchall()
    windows = {}
    for key, label, days in (("today", "Hoje", 0), ("week", "7 dias", 6),
                             ("competitive", "Alto nível · 7 dias", 6)):
        start = today - timedelta(days=days)
        selected = [row for row in rows if start <= row["day"] <= today]
        if key == "competitive":
            selected = [row for row in selected if (row["observed_elo"] or 0) >= minimum]
        if not selected:
            continue
        groups = defaultdict(list)
        for row in selected:
            groups[row["mode"], row["map_name"]].append(row)
        contexts = [summarize_context(selected, None, None)]
        contexts.extend(summarize_context(group, *group_key) for group_key, group in groups.items())
        windows[key] = {"label": label, "start": start.isoformat(), "end": today.isoformat(),
                        "latest": contexts[0]["latest"], "contexts": contexts}
    cursor.execute("""
        SELECT COUNT(*) AS queued,
               COUNT(*) FILTER (WHERE last_checked_at IS NOT NULL) AS checked,
               COUNT(*) FILTER (WHERE ranked_elo >= %s) AS qualified
        FROM meta_sample_players
    """, (minimum,))
    queue = cursor.fetchone()
    cursor.execute("SELECT last_run_at FROM meta_tracker_state WHERE singleton")
    state = cursor.fetchone()
    return {"windows": windows, "tracking": {**queue, "minimum_elo": minimum,
                                             "last_run_at": iso(state["last_run_at"]) if state else None}}
