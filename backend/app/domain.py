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
             or string(obj(entry).get("brawlerName")) or string(obj(entry).get("name")) for entry in value]
    return names if all(names) else None


def battle_teams(battle):
    teams = battle.get("teams")
    return teams if isinstance(teams, list) and teams and all(isinstance(team, list) for team in teams) else []


def battle_members(battle):
    teams = battle_teams(battle)
    if teams:
        return [member for team in teams for member in team]
    players = battle.get("players")
    return players if isinstance(players, list) else []


def banned_brawler(member):
    entry = obj(member.get("bannedBrawler"))
    name = string(entry.get("name"))
    return {"id": integer(entry.get("id")), "name": name} if name else None


def battle_bans(battle):
    draft_bans = bans(obj(battle.get("draft")).get("bans"))
    explicit = draft_bans if draft_bans is not None else bans(battle.get("bans"))
    if explicit:
        return explicit
    teams = battle_teams(battle)
    if battle.get("type") not in RANKED_TYPES or len(teams) != 2 or any(len(team) != 3 for team in teams):
        return explicit
    members = [obj(member) for team in teams for member in team]
    observed = [entry["name"] for member in members if (entry := banned_brawler(member))]
    tags = {string(member.get("tag")) for member in members}
    if len(observed) == len(members) == len(tags) and None not in tags:
        return observed
    return None if observed else explicit


def member_stats(member):
    readings = (obj(member.get("stats")), obj(member.get("statistics")), member)
    fields = {"kills": "kills", "deaths": "deaths", "damageDealt": "damage_dealt",
              "damageTaken": "damage_taken", "healing": "healing"}
    stats = {}
    for reading in readings:
        for source, field in fields.items():
            value = integer(reading.get(source))
            if value is not None and value >= 0:
                stats.setdefault(field, value)
        objective = obj(reading.get("modeStat"))
        kind, value = string(objective.get("type")), integer(objective.get("value"))
        if kind and value is not None and value >= 0:
            stats.setdefault("objective", {"type": kind, "value": value})
    return stats


def battle_kd(battle, account):
    matching = [obj(member) for member in battle_members(battle) if obj(member).get("tag") == account]
    if len(matching) == 1:
        stats = member_stats(matching[0])
        if "kills" in stats and "deaths" in stats:
            return {"kills": stats["kills"], "deaths": stats["deaths"], "reference": None}
    return None


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def with_known(previous, current):
    return {**obj(previous), **{key: value for key, value in obj(current).items() if value is not None}}


def merge_stats(previous, current):
    stats = with_known(previous, current)
    old_objective, new_objective = obj(obj(previous).get("modeStat")), obj(obj(current).get("modeStat"))
    if old_objective and new_objective.get("type") in (None, old_objective.get("type")):
        stats["modeStat"] = with_known(old_objective, new_objective)
    return stats


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
        if obj(old.get("brawler")) or obj(member.get("brawler")):
            updated["brawler"] = with_known(old.get("brawler"), member.get("brawler"))
        for key in ("stats", "statistics"):
            if obj(old.get(key)) or obj(member.get(key)):
                updated[key] = merge_stats(old.get(key), member.get(key))
        old_ban, new_ban = obj(old.get("bannedBrawler")), obj(member.get("bannedBrawler"))
        if old_ban and new_ban.get("id") in (None, old_ban.get("id")):
            updated["bannedBrawler"] = with_known(old_ban, new_ban)
        merged.append(updated)
    return merged


def member_tags(team):
    return {tag for member in team if (tag := string(obj(member).get("tag")))}


def merge_battle_log(previous, current):
    """Preserve observations already saved for the same account and battle time."""
    old, fresh = obj(previous.get("battle")), obj(current.get("battle"))
    battle = with_known(old, fresh)
    if obj(old.get("draft")) or obj(fresh.get("draft")):
        battle["draft"] = with_known(old.get("draft"), fresh.get("draft"))
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
    groups = battle_teams(battle)
    grouped = bool(groups)
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
    ban_list = battle_bans(battle)
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
