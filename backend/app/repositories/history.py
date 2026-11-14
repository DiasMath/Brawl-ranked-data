from datetime import timedelta
import json

from ..domain import battle_bans, integer, iso, obj, ranked_reading, string, utc_now


def latest_run(cursor, player, successful=False, *, scheduled=False):
    cursor.execute(
        "SELECT id, started_at, finished_at, status, received, added, message, phase, processed, origin "
        "FROM update_log WHERE player_tag=%s " + ("AND status='success' " if successful else "") +
        ("AND origin='scheduled' " if scheduled else "") + "ORDER BY id DESC LIMIT 1", (player,),
    )
    return cursor.fetchone()


def retry_until(cursor):
    cursor.execute("""
        SELECT GREATEST(
            (SELECT MAX(retry_until) FROM collection_state),
            (SELECT retry_until FROM meta_tracker_state WHERE singleton)
        ) AS retry_until
    """)
    return (cursor.fetchone() or {}).get("retry_until")


def remember_retry(cursor, player, error):
    until = utc_now() + timedelta(seconds=int((error.headers or {}).get("Retry-After", 600)))
    cursor.execute(
        "INSERT INTO collection_state (player_tag, retry_until) VALUES (%s,%s) "
        "ON CONFLICT (player_tag) DO UPDATE SET retry_until=EXCLUDED.retry_until",
        (player, until),
    )


def dataset(cursor, player, after_run=0, include_archive=False):
    cursor.execute("SELECT player_name, fetched_at, raw FROM account_profile WHERE player_tag=%s", (player,))
    profile = cursor.fetchone()
    changed = (" AND (o.last_run_id>%s OR e.recorded_at >= "
               "(SELECT started_at FROM update_log WHERE id=%s))") if after_run else ""
    params = (player, after_run, after_run) if after_run else (player,)
    cursor.execute(f"""
        SELECT b.id, b.played_at, b.event_id, b.map_name, b.mode, b.api_type, b.ranked, b.result, b.duration_seconds,
               b.player_brawler, COALESCE(b.rank_label, e.rank_label) AS rank_label,
               COALESCE(b.rank_score, e.rank_score) AS rank_score, COALESCE(b.season, e.season) AS season,
               COALESCE(b.bans, e.bans) AS bans,
               CASE WHEN b.rank_label IS NULL THEN e.rank_reference END AS rank_reference,
               CASE WHEN b.rank_score IS NULL THEN e.score_reference END AS score_reference,
               CASE WHEN b.season IS NULL THEN e.season_reference END AS season_reference,
               CASE WHEN b.bans IS NULL THEN e.bans_reference END AS bans_reference,
               CASE WHEN b.rank_label IS NULL AND e.rank_label IS NOT NULL THEN 'evidência' END AS rank_source,
               CASE WHEN b.rank_score IS NULL AND e.rank_score IS NOT NULL THEN 'evidência' END AS score_source,
               CASE WHEN b.season IS NULL AND e.season IS NOT NULL THEN 'evidência' END AS season_source,
               CASE WHEN b.bans IS NULL AND e.bans IS NOT NULL THEN 'evidência' END AS bans_source,
               o.first_seen_at, o.delay_observed, b.raw, calendar.season_by_date
        FROM battles b LEFT JOIN battle_evidence e ON e.battle_id=b.id
        LEFT JOIN battle_collection o ON o.battle_id=b.id
        LEFT JOIN LATERAL (
            SELECT CASE WHEN COUNT(*)=1 THEN json_build_object('label', MIN(label), 'source_url', MIN(source_url)) END
                AS season_by_date
            FROM ranked_seasons WHERE b.ranked AND b.played_at >= starts_at AND b.played_at < ends_at
        ) calendar ON b.ranked AND b.season IS NULL AND e.season IS NULL
        WHERE b.player_tag=%s{changed} ORDER BY b.played_at DESC
    """, params)
    matches = cursor.fetchall()
    by_id = {row["id"]: row for row in matches}
    raw_battles = {}
    for match in matches:
        item = json.loads(match.pop("raw"))
        battle = obj(item.get("battle"))
        if include_archive:
            raw_battles[match["id"]] = item
        match["trophy_change"] = integer(battle.get("trophyChange")) if match["api_type"] == "ranked" else None
        star = obj(battle.get("starPlayer"))
        match["star_player"] = {"tag": string(star.get("tag")), "name": string(star.get("name"))} if star else None
        mode = (match["mode"] or "").lower()
        match["placement"] = integer(battle.get("rank")) if "showdown" in mode else None
        match["first_seen_at"] = iso(match["first_seen_at"])
        match["delay_observed"] = bool(match["delay_observed"])
        match["played_at"] = iso(match["played_at"])
        match["ranked"] = bool(match["ranked"])
        match["bans"] = json.loads(match["bans"]) if match["bans"] is not None else None
        if match["ranked"]:
            rank, score, season = ranked_reading(battle)
            for field, prefix, value in (("rank_label", "rank", rank), ("rank_score", "score", score),
                                         ("season", "season", season), ("bans", "bans", battle_bans(battle))):
                if value is not None and (match[field] is None or match[f"{prefix}_source"]):
                    match[field] = value
                    match[f"{prefix}_source"] = match[f"{prefix}_reference"] = None
        if match["season"] is not None:
            match["season_by_date"] = None
        match["players"] = []
    cursor.execute(f"""
        SELECT p.battle_id, p.team_index, p.player_tag, p.player_name, p.brawler_id, p.brawler, p.power, p.side
        FROM battle_players p JOIN battles b ON p.battle_id=b.id
        LEFT JOIN battle_collection o ON o.battle_id=b.id
        LEFT JOIN battle_evidence e ON e.battle_id=b.id WHERE b.player_tag=%s{changed}
        ORDER BY p.battle_id, p.team_index, p.slot
    """, params)
    for participant in cursor.fetchall():
        by_id[participant.pop("battle_id")]["players"].append(participant)
    cursor.execute("SELECT id, started_at, finished_at, status, received, added, message FROM update_log "
                   "WHERE player_tag=%s ORDER BY id DESC LIMIT 100", (player,))
    updates = cursor.fetchall()
    for row in updates:
        row["started_at"], row["finished_at"] = iso(row["started_at"]), iso(row["finished_at"])
    cursor.execute("SELECT id, source_name, source_url, period_start, period_end, map_name, mode, rank_label, season, "
                   "brawler, wins, games, pick_count, pick_total, ban_count, ban_total "
                   "FROM meta_observations WHERE player_tag=%s ORDER BY period_end DESC, id DESC", (player,))
    meta = cursor.fetchall()
    raw_profile = json.loads(profile["raw"]) if profile else {}
    profile_rank, profile_score, profile_season = ranked_reading(raw_profile)
    brawlers = raw_profile.get("brawlers")
    owned = []
    for brawler in brawlers if isinstance(brawlers, list) else []:
        name, power = string(obj(brawler).get("name")), integer(obj(brawler).get("power"))
        if name and power is not None:
            owned.append({
                "name": name, "power": power, "id": integer(brawler.get("id")),
                "trophies": integer(brawler.get("trophies")), "highest_trophies": integer(brawler.get("highestTrophies")),
                "rank": integer(brawler.get("rank")),
                "gadgets": equipment(brawler.get("gadgets")), "star_powers": equipment(brawler.get("starPowers")),
                "gears": equipment(brawler.get("gears")),
            })
    club = obj(raw_profile.get("club"))
    snapshot = {
        "schema": 1, "exported_at": iso(utc_now()), "player_tag": player,
        "profile": {"name": profile["player_name"], "fetched_at": iso(profile["fetched_at"]),
                    "trophies": integer(raw_profile.get("trophies")), "icon_id": integer(obj(raw_profile.get("icon")).get("id")),
                    "rank_label": profile_rank, "rank_score": profile_score, "season": profile_season,
                    "highest_trophies": integer(raw_profile.get("highestTrophies")),
                    "exp_level": integer(raw_profile.get("expLevel")),
                    "victories_3v3": integer(raw_profile.get("3vs3Victories")),
                    "solo_victories": integer(raw_profile.get("soloVictories")),
                    "duo_victories": integer(raw_profile.get("duoVictories")),
                    "club": {"tag": string(club.get("tag")), "name": string(club.get("name"))} if club else None,
                    "owned_brawlers": owned} if profile else None,
        "matches": matches, "updates": updates, "meta": meta,
    }
    if include_archive:
        cursor.execute("SELECT run_id, observed_at, trophies, rank_score, rank_label, season FROM profile_readings "
                       "WHERE player_tag=%s AND run_id>%s ORDER BY run_id", (player, after_run))
        snapshot["progress"] = [
            {"id": f"server:{iso(row['observed_at'])}", "at": iso(row["observed_at"]), "trophies": row["trophies"],
             "score": row["rank_score"], "rank": row["rank_label"], "season": row["season"],
             "source": "Perfil da API · servidor", "method": "api"}
            for row in cursor.fetchall()
        ]
        snapshot["raw"] = raw_battles
    return snapshot


def equipment(value):
    if not isinstance(value, list):
        return None
    return [{"id": integer(item.get("id")), "name": name}
            for entry in value if (item := obj(entry)) and (name := string(item.get("name")))]
