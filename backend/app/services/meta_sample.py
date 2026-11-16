from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from itertools import permutations
import json

from ..config import meta_min_elo
from ..domain import encoded, iso, obj, parse_battle, tag, utc_now
from ..repositories.competitive import BRASILIA, competitive_periods, public_period, sampled_battles
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
    bans = sorted({name.casefold().strip() for name in json.loads(battle["bans"])}) if battle["bans"] is not None else None
    return (match_id, played_at, battle["map_name"], battle["mode"],
            [brawler for _, brawler in identities[0]], [brawler for _, brawler in identities[1]], winning_index,
            bans, False)


def merge_sample_rows(rows):
    observations = {}
    for row in rows:
        previous = observations.get(row[0])
        if previous is not None:
            old_bans, old_conflict = previous[7:]
            new_bans, new_conflict = row[7:]
            mismatch = old_bans is not None and new_bans is not None and old_bans != new_bans
            row = (*row[:7], old_bans if old_bans is not None else new_bans,
                   old_conflict or new_conflict or mismatch)
        observations[row[0]] = row
    return observations


def choose_players(client, excluded, *, region="global", limit=10, count=5):
    response = fetch(client, f"rankings/{region}/players?limit={limit}")
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
    return merge_sample_rows(row for result in results if isinstance(result, list) for row in result), len(errors)


def save_sample(cursor, battles, observed_elo=None):
    added = 0
    for row in battles.values():
        cursor.execute("""
            INSERT INTO meta_sample_battles
                (id, played_at, map_name, mode, team_a, team_b, winner, observed_elo, bans, bans_conflict)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING
        """, (*row[:7], observed_elo, *row[7:]))
        added += cursor.rowcount
        bans, bans_conflict = row[7:]
        if cursor.rowcount == 0 and (observed_elo is not None or bans is not None or bans_conflict):
            cursor.execute("""
                UPDATE meta_sample_battles AS stored
                SET observed_elo=GREATEST(stored.observed_elo, incoming.elo),
                    bans=COALESCE(stored.bans, incoming.bans),
                    bans_conflict=stored.bans_conflict OR incoming.conflict OR
                        (stored.bans IS NOT NULL AND incoming.bans IS NOT NULL AND stored.bans <> incoming.bans)
                FROM (VALUES (%s::int, %s::text[], %s::boolean)) AS incoming(elo, bans, conflict)
                WHERE stored.id=%s AND (
                    (incoming.elo IS NOT NULL AND (stored.observed_elo IS NULL OR stored.observed_elo < incoming.elo))
                    OR (NOT stored.bans_conflict AND
                        (incoming.conflict OR (incoming.bans IS NOT NULL AND stored.bans IS DISTINCT FROM incoming.bans)))
                )
            """, (observed_elo, bans, bans_conflict, row[0]))
    return added


def summarize_context(rows, mode, map_name):
    picks = defaultdict(lambda: [0, 0, 0])
    pairs = defaultdict(lambda: [0, 0])
    allies = defaultdict(lambda: [0, 0])
    bans = defaultdict(int)
    ban_known = 0
    decisive = 0
    for row in rows:
        recorded = row["bans"]
        if recorded is not None and not row["bans_conflict"]:
            ban_known += 1
            for name in recorded:
                bans[name] += 1
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
                   "allies": [[*key, *stat] for key, stat in allies.items()],
                   "banKnown": ban_known, "bansByName": list(bans.items())},
    }


def window_contexts(rows):
    if not rows:
        return []
    groups = defaultdict(list)
    for row in rows:
        groups[row["mode"], row["map_name"]].append(row)
    return [summarize_context(rows, None, None),
            *(summarize_context(group, *key) for key, group in groups.items())]


def sample_report(cursor):
    minimum = meta_min_elo()
    now = utc_now()
    today = now.replace(tzinfo=UTC).astimezone(BRASILIA).date()
    week_start = today - timedelta(days=6)
    week_start_utc = datetime.combine(week_start, datetime.min.time(), BRASILIA).astimezone(UTC).replace(tzinfo=None)
    periods = competitive_periods(cursor, now)
    start_times = [week_start_utc, *(period["start_at"] for period in periods.values())]
    rows = sampled_battles(cursor, min(start_times), now)
    competitive = [row for row in rows if (row["observed_elo"] or 0) >= minimum]
    windows = {}
    for key, label, start in (("today", "Hoje", today), ("week", "7 dias", week_start),
                              ("competitive", "Alto nível · 7 dias", week_start)):
        source = competitive if key == "competitive" else rows
        contexts = window_contexts([row for row in source if start <= row["day"] <= today])
        if contexts:
            windows[key] = {"label": label, "start": start.isoformat(), "end": today.isoformat(),
                            "latest": contexts[0]["latest"], "contexts": contexts}
    for key, period in periods.items():
        contexts = window_contexts([row for row in competitive
                                    if period["start_at"] <= row["played_at"] < period["end_at"]])
        windows[key] = {**public_period(period), "latest": contexts[0]["latest"] if contexts else None,
                        "contexts": contexts, "minimum_elo": minimum}
    cursor.execute("""
        SELECT COUNT(*) AS queued,
               COUNT(*) FILTER (WHERE last_checked_at IS NOT NULL) AS checked,
               COUNT(*) FILTER (WHERE ranked_elo >= %s) AS qualified,
               COUNT(*) FILTER (WHERE next_check_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) AS due
        FROM meta_sample_players p
        WHERE NOT EXISTS (SELECT 1 FROM tracked_accounts a WHERE a.player_tag=p.player_tag)
    """, (minimum,))
    queue = cursor.fetchone()
    cursor.execute("SELECT last_run_at FROM meta_tracker_state WHERE singleton")
    state = cursor.fetchone()
    return {"windows": windows, "tracking": {**queue, "minimum_elo": minimum,
                                             "last_run_at": iso(state["last_run_at"]) if state else None}}
