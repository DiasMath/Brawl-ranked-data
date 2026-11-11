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


def bans(value):
    if not isinstance(value, list):
        return None
    names = [string(entry) or string(obj(obj(entry).get("brawler")).get("name"))
             or string(obj(entry).get("brawlerName")) for entry in value]
    return names if all(names) else None


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
    draft = obj(battle.get("draft"))
    ban_list = bans(draft.get("bans", battle.get("bans"))) if ranked else None
    return {
        "id": key, "player_tag": account, "played_at": played, "event_id": event_id,
        "map_name": string(event.get("map")), "mode": string(battle.get("mode")) or string(event.get("mode")),
        "api_type": raw_type, "ranked": ranked, "result": result if result in RESULTS else None,
        "duration_seconds": integer(battle.get("duration")), "player_brawler_id": integer(owner.get("id")),
        "player_brawler": string(owner.get("name")), "rank_label": string(battle.get("rankedRank")) if ranked else None,
        "rank_score": integer(battle.get("rankedScore")) if ranked else None,
        "season": string(battle.get("rankedSeason")) if ranked else None,
        "bans": encoded(ban_list) if ban_list is not None else None, "raw": encoded(item), "players": players,
    }
