from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import logging

from ..config import meta_batch_size, meta_min_elo, meta_regions
from ..db import database
from ..domain import ranked_reading, utc_now
from ..repositories.accounts import list_accounts
from ..repositories.history import retry_until
from ..repositories.competitive import record_collection
from .credentials import stored_token
from .meta_sample import choose_players, discovered_players, player_battlelog, sample_battle, save_sample
from .supercell import CollectionError, CountedCompetitiveClient, fetch, official_client


LOG = logging.getLogger("brawl.meta")


def enqueue_players(cursor, players, now):
    if players:
        cursor.executemany("""
            INSERT INTO meta_sample_players (player_tag, next_check_at)
            VALUES (%s,%s) ON CONFLICT (player_tag) DO NOTHING
        """, [(player, now) for player in sorted(players)])


def pause_tracker(cursor, error):
    until = utc_now() + timedelta(seconds=int((error.headers or {}).get("Retry-After", 600)))
    cursor.execute("""
        INSERT INTO meta_tracker_state (singleton, retry_until) VALUES (TRUE,%s)
        ON CONFLICT (singleton) DO UPDATE SET retry_until=EXCLUDED.retry_until
    """, (until,))


def read_player(client, player, minimum):
    try:
        profile = fetch(client, "players/%23" + player[1:])
        if profile.get("tag") != player:
            raise CollectionError(502, "O perfil retornado não corresponde à tag da amostra.")
        _, elo, _ = ranked_reading(profile)
        if elo is None or elo < minimum:
            return elo, {}, set()
        items = player_battlelog(client, player)
        complete = [(item, battle) for item in items if (battle := sample_battle(item, player)) is not None]
        return elo, {battle[0]: battle for _, battle in complete}, discovered_players(item for item, _ in complete)
    except CollectionError as error:
        return error


def seed_players(client, regions, excluded):
    seeds = set()
    for region in regions:
        try:
            seeds.update(choose_players(client, excluded, region=region, limit=200, count=200))
        except CollectionError as error:
            if error.status_code in (403, 429, 503):
                raise
            LOG.warning("Classificação %s indisponível (HTTP %s).", region, error.status_code)
    return seeds


def collect_competitive_sample():
    minimum = meta_min_elo()
    batch_size = meta_batch_size()
    regions = meta_regions()
    seed_regions = ",".join(regions)
    now = utc_now()
    now = now.replace(microsecond=now.microsecond // 1000 * 1000)
    with database() as (connection, cursor):
        cursor.execute("SELECT pg_try_advisory_xact_lock(hashtextextended('brawl:sync', 0)) AS acquired")
        if not cursor.fetchone()["acquired"]:
            return None
        until = retry_until(cursor)
        if until and until > now:
            return None
        excluded = {account["tag"] for account in list_accounts(cursor)}
        cursor.execute("SELECT last_seed_at, seed_regions FROM meta_tracker_state WHERE singleton")
        state = cursor.fetchone()
        key = stored_token(cursor)
        with official_client(key) as raw_client:
            client = CountedCompetitiveClient(raw_client)
            if (not state or not state["last_seed_at"] or state["seed_regions"] != seed_regions
                    or now - state["last_seed_at"] >= timedelta(hours=6)):
                try:
                    seeds = seed_players(client, regions, excluded)
                except CollectionError as error:
                    if error.status_code == 429:
                        pause_tracker(cursor, error)
                    record_collection(cursor, "scheduled", client, 0, 0, "error")
                    connection.commit()
                    raise
                if seeds:
                    enqueue_players(cursor, seeds, now)
                    LOG.info("%s tags candidatas nas classificações %s.", len(seeds), seed_regions)
                    cursor.execute("""
                        INSERT INTO meta_tracker_state (singleton,last_seed_at,seed_regions) VALUES (TRUE,%s,%s)
                        ON CONFLICT (singleton) DO UPDATE SET last_seed_at=EXCLUDED.last_seed_at,
                            seed_regions=EXCLUDED.seed_regions
                    """, (now, seed_regions))
                else:
                    LOG.warning("Classificações públicas sem novas tags para alimentar a fila nesta rodada.")
            cursor.execute("""
                SELECT p.player_tag FROM meta_sample_players p
                WHERE p.next_check_at <= %s
                  AND NOT EXISTS (SELECT 1 FROM tracked_accounts a WHERE a.player_tag=p.player_tag)
                ORDER BY p.next_check_at, p.player_tag LIMIT %s
            """, (now, batch_size))
            players = [row["player_tag"] for row in cursor.fetchall()]
            if not players:
                if client.total:
                    record_collection(cursor, "scheduled", client, 0, 0, "ok" if seeds else "error")
                    connection.commit()
                return None
            results = []
            with ThreadPoolExecutor(max_workers=5) as workers:
                for offset in range(0, len(players), 5):
                    batch = list(workers.map(
                        lambda player: read_player(client, player, minimum), players[offset:offset + 5],
                    ))
                    results.extend(batch)
                    if any(isinstance(result, CollectionError) and result.status_code in (403, 429, 503)
                           for result in batch):
                        break
            players = players[:len(results)]
        added = qualified = failed = 0
        received = set()
        discovered = set()
        first_error = None
        for player, result in zip(players, results):
            if isinstance(result, CollectionError):
                failed += 1
                first_error = first_error or result
                if result.status_code == 429:
                    pause_tracker(cursor, result)
                cursor.execute("UPDATE meta_sample_players SET next_check_at=%s WHERE player_tag=%s",
                               (now + timedelta(minutes=30), player))
                continue
            elo, battles, participants = result
            eligible = elo is not None and elo >= minimum
            qualified += int(eligible)
            received.update(battles)
            added += save_sample(cursor, battles, elo)
            discovered.update(participants)
            interval = timedelta(minutes=15) if eligible else timedelta(hours=12)
            cursor.execute("""
                UPDATE meta_sample_players SET last_checked_at=%s, ranked_elo=%s, next_check_at=%s
                WHERE player_tag=%s
            """, (now, elo, now + interval, player))
        enqueue_players(cursor, discovered - excluded, now)
        if failed < len(players):
            cursor.execute("""
                INSERT INTO meta_tracker_state (singleton,last_run_at) VALUES (TRUE,%s)
                ON CONFLICT (singleton) DO UPDATE SET last_run_at=EXCLUDED.last_run_at
            """, (utc_now(),))
        status = "error" if failed == len(players) else "partial" if failed else "ok"
        record_collection(cursor, "scheduled", client, len(received), added, status)
        connection.commit()
        if failed == len(players):
            raise first_error
        return {"checked": len(players) - failed, "qualified": qualified, "added": added, "failed": failed,
                "received": len(received), "requests": client.total}
