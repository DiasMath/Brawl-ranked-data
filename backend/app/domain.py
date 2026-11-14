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


def with_known(previous, current):
    return {**obj(previous), **{key: value for key, value in obj(current).items() if value is not None}}


def merge_members(previous, current):
    known = {string(obj(member).get("tag")): obj(member) for member in previous if obj(member).get("tag")}
    current_tags = {string(obj(member).get("tag")) for member in current}
    if not known.keys() <= current_tags:
        return previous
    merged = []
    for entry in current:
        member = obj(entry)
        old = known.get(string(member.get("tag")), {})
        updated = with_known(old, member)
        for key in ("brawler", "statistics"):
            if obj(old.get(key)) or obj(member.get(key)):
                updated[key] = with_known(old.get(key), member.get(key))
        merged.append(updated)
    return merged


def member_tags(team):
    return {tag for member in team if (tag := string(obj(member).get("tag")))}


def merge_battle_log(previous, current):
    """Preserve observations already saved for the same account and battle time."""
    old, fresh = obj(previous.get("battle")), obj(current.get("battle"))
    battle = with_known(old, fresh)
    old_star, new_star = obj(old.get("starPlayer")), obj(fresh.get("starPlayer"))
    if old_star and not (string(new_star.get("tag")) or string(new_star.get("name"))):
        battle["starPlayer"] = old_star
    elif old_star.get("tag") and old_star.get("tag") == new_star.get("tag"):
        battle["starPlayer"] = with_known(old_star, new_star)
    old_teams, new_teams = old.get("teams"), fresh.get("teams")
    if isinstance(old_teams, list) and all(isinstance(team, list) for team in old_teams):
        if not isinstance(new_teams, list) or len(new_teams) < len(old_teams) or not all(
            isinstance(team, list) for team in new_teams
        ):
            battle["teams"] = old_teams
        else:
            known_teams = [(tags, team) for team in old_teams if (tags := member_tags(team))]
            fresh_tags = [member_tags(team) for team in new_teams]
            if all(any(tags <= current for current in fresh_tags) for tags, _ in known_teams):
                battle["teams"] = [
                    merge_members(next((members for tags, members in known_teams if tags <= current), []), team)
                    for current, team in zip(fresh_tags, new_teams)
                ]
            else:
                battle["teams"] = old_teams
    old_players, new_players = old.get("players"), fresh.get("players")
    if isinstance(old_players, list) and isinstance(new_players, list):
        battle["players"] = merge_members(old_players, new_players)
    return {**with_known(previous, current), "event": with_known(previous.get("event"), current.get("event")),
            "battle": battle}


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
