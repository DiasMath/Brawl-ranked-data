from datetime import UTC, datetime
from hashlib import sha256
import json
import re


RANKED_TYPES = {"soloRanked", "teamRanked"}
RESULTS = {"victory", "defeat", "draw"}


def utc_now():
    return datetime.now(UTC).replace(tzinfo=None)


def iso(value):
    return value.isoformat(timespec="milliseconds") + "Z" if value else None


def tag(value):
    normalized = "#" + str(value or "").strip().lstrip("#").upper()
    if not re.fullmatch(r"#[0289PYLQGRJCUV]{3,16}", normalized):
        raise ValueError("Tag de jogador inválida.")
    return normalized


def battle_time(value):
    pattern = "%Y%m%dT%H%M%S.%fZ" if "." in value else "%Y%m%dT%H%M%SZ"
    return datetime.strptime(value, pattern)


def obj(value):
    return value if isinstance(value, dict) else {}


def integer(value):
    return value if type(value) is int else None


def string(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def ranked_reading(data):
    raw_rank = data.get("rankedRank")
    rank = string(data.get("rankedRankName")) or string(raw_rank)
    if rank is None and integer(raw_rank) is not None:
        rank = str(raw_rank)
    elo = integer(data.get("rankedElo"))
    raw_season = data.get("rankedSeason")
    season = string(raw_season)
    if season is None and integer(raw_season) is not None:
        season = str(raw_season)
    return rank, elo if elo is not None else integer(data.get("rankedScore")), season


def bans(value):
    if not isinstance(value, list):
        return None
    names = [string(entry) or string(obj(obj(entry).get("brawler")).get("name"))
             or string(obj(entry).get("brawlerName")) for entry in value]
    return names if all(names) else None


def battle_bans(battle):
    return bans(obj(battle.get("draft")).get("bans", battle.get("bans")))


def battle_kd(battle, account):
    teams = battle.get("teams")
    players = battle.get("players")
    if isinstance(teams, list):
        players = [player for team in teams if isinstance(team, list) for player in team]
    if not isinstance(players, list):
        return None
    matching = [obj(player) for player in players if obj(player).get("tag") == account]
    if len(matching) != 1:
        return None
    player = matching[0]
    for stats in (obj(player.get("statistics")), player):
        kills, deaths = integer(stats.get("kills")), integer(stats.get("deaths"))
        if kills is not None and deaths is not None and kills >= 0 and deaths >= 0:
            return {"kills": kills, "deaths": deaths, "reference": None}
    return None


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def parse_battle(item, account):
    played = battle_time(item["battleTime"])
    event = obj(item.get("event"))
    battle = obj(item.get("battle"))
    raw_type = string(battle.get("type"))
    ranked = raw_type in RANKED_TYPES
    groups = battle.get("teams")
    grouped = isinstance(groups, list) and bool(groups) and all(isinstance(team, list) for team in groups)
    if not grouped:
        players = battle.get("players")
        groups = [[member] for member in players] if isinstance(players, list) else []
    own_teams = {i for i, group in enumerate(groups) for member in group if obj(member).get("tag") == account}
    own_team = next(iter(own_teams)) if len(own_teams) == 1 else None
    players = []
    owner = {}
    for i, group in enumerate(groups):
        for j, member in enumerate(group):
            member = obj(member)
            brawler = obj(member.get("brawler"))
            member_tag = string(member.get("tag"))
            if member_tag == account:
                side = "self"
                owner = brawler
            elif grouped and own_team is not None:
                side = "ally" if i == own_team else "opponent"
            elif groups and own_team is not None:
                side = "opponent"
            else:
                side = "unknown"
            players.append((i, j, member_tag, string(member.get("name")), integer(brawler.get("id")),
                            string(brawler.get("name")), integer(brawler.get("power")), side))
    event_id = integer(event.get("id"))
    key = sha256(encoded([account, iso(played)]).encode()).hexdigest()
    result = string(battle.get("result"))
    ban_list = battle_bans(battle) if ranked else None
    rank, score, season = ranked_reading(battle) if ranked else (None, None, None)
    return {
        "id": key, "player_tag": account, "played_at": played, "event_id": event_id,
        "map_name": string(event.get("map")), "mode": string(battle.get("mode")) or string(event.get("mode")),
        "api_type": raw_type, "ranked": ranked, "result": result if result in RESULTS else None,
        "duration_seconds": integer(battle.get("duration")), "player_brawler_id": integer(owner.get("id")),
        "player_brawler": string(owner.get("name")), "rank_label": rank,
        "rank_score": score, "season": season,
        "bans": encoded(ban_list) if ban_list is not None else None, "raw": encoded(item), "players": players,
    }
